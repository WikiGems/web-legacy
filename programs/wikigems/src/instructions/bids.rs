//! Public bids on any card, listed or not. Each card has one bid slot holding
//! the best offer; the USDC is escrowed in a program vault until the bid is
//! outbid, cancelled, accepted or used for a reclaim.
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::*,
    error::WikiGemsError,
    events::{BidAccepted, BidCancelled, BidPlaced},
    gem::{gem_owner, split_fee, token_close, token_transfer, GemTransfer, Usdc},
    state::{Bid, Config},
};

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = collection, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Pinned by `has_one = collection`.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(owner = mpl_core::ID)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Bid::INIT_SPACE,
        seeds = [BID_SEED, asset.key().as_ref()],
        bump,
    )]
    pub bid: Box<Account<'info, Bid>>,

    #[account(
        init_if_needed,
        payer = payer,
        seeds = [BID_VAULT_SEED, asset.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = bid,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    pub bidder: Signer<'info>,

    #[account(mut, token::mint = usdc_mint, token::authority = bidder)]
    pub bidder_usdc: Box<Account<'info, TokenAccount>>,

    /// CHECK: Required when a bid exists; must be its bidder, who is refunded.
    pub previous_bidder: Option<UncheckedAccount<'info>>,

    /// CHECK: The previous bidder's USDC associated token account, created if missing.
    #[account(mut)]
    pub previous_bidder_usdc: Option<UncheckedAccount<'info>>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
    require!(amount > 0, WikiGemsError::ZeroAmount);
    let accounts = ctx.accounts;
    let asset = accounts.asset.key();
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    require_keys_neq!(accounts.bidder.key(), owner, WikiGemsError::OwnCard);

    let usdc = Usdc {
        mint: &accounts.usdc_mint.to_account_info(),
        token_program: &accounts.token_program.to_account_info(),
        system_program: &accounts.system_program.to_account_info(),
        payer: &accounts.payer.to_account_info(),
    };
    let vault = accounts.vault.to_account_info();
    let bid_info = accounts.bid.to_account_info();
    let bid = &mut accounts.bid;

    let outbid = if bid.bidder == Pubkey::default() {
        bid.asset = asset;
        bid.rent_payer = accounts.payer.key();
        bid.bump = ctx.bumps.bid;
        bid.vault_bump = ctx.bumps.vault;
        None
    } else {
        require!(amount > bid.amount, WikiGemsError::BidTooLow);
        let (Some(previous), Some(previous_usdc)) =
            (&accounts.previous_bidder, &accounts.previous_bidder_usdc)
        else {
            return err!(WikiGemsError::NotAllowed);
        };
        require_keys_eq!(previous.key(), bid.bidder, WikiGemsError::NotAllowed);
        usdc.ensure_ata(previous_usdc, previous)?;
        let bump = [bid.bump];
        let seeds: &[&[u8]] = &[BID_SEED, asset.as_ref(), &bump];
        token_transfer(&vault, previous_usdc, &bid_info, bid.amount, &[seeds])?;
        Some(bid.bidder)
    };

    let bidder = accounts.bidder.to_account_info();
    token_transfer(
        &accounts.bidder_usdc.to_account_info(),
        &vault,
        &bidder,
        amount,
        &[],
    )?;
    bid.bidder = bidder.key();
    bid.amount = amount;
    bid.placed_at = Clock::get()?.unix_timestamp;

    emit!(BidPlaced {
        asset,
        bidder: bidder.key(),
        amount,
        outbid,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelBid<'info> {
    #[account(
        mut,
        seeds = [BID_SEED, bid.asset.as_ref()],
        bump = bid.bump,
        has_one = bidder,
        close = rent_payer,
    )]
    pub bid: Box<Account<'info, Bid>>,

    #[account(mut, seeds = [BID_VAULT_SEED, bid.asset.as_ref()], bump = bid.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,

    pub bidder: Signer<'info>,

    #[account(mut, token::mint = vault.mint, token::authority = bidder)]
    pub bidder_usdc: Box<Account<'info, TokenAccount>>,

    /// CHECK: Receives the bid's and the vault's rent.
    #[account(mut, address = bid.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

/// Works even if the card has since been burned, so escrowed USDC can never
/// get stuck.
pub fn handle_cancel_bid(ctx: Context<CancelBid>) -> Result<()> {
    let accounts = ctx.accounts;
    let bid = &accounts.bid;
    let bump = [bid.bump];
    let seeds: &[&[u8]] = &[BID_SEED, bid.asset.as_ref(), &bump];
    let bid_info = bid.to_account_info();
    let vault = accounts.vault.to_account_info();
    token_transfer(
        &vault,
        &accounts.bidder_usdc.to_account_info(),
        &bid_info,
        bid.amount,
        &[seeds],
    )?;
    token_close(&vault, &accounts.rent_payer, &bid_info, &[seeds])?;

    emit!(BidCancelled {
        asset: bid.asset,
        bidder: bid.bidder,
        amount: bid.amount,
    });
    Ok(())
}

/// Accounts shared by `accept_bid` and `reclaim`: the bid is paid out of its
/// vault, the vault is closed, and the card moves to the bidder.
#[derive(Accounts)]
pub struct AcceptBid<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = collection, has_one = treasury, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Pinned by `has_one = collection`; Core checks the asset belongs to it.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(mut, owner = mpl_core::ID, address = bid.asset)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BID_SEED, bid.asset.as_ref()],
        bump = bid.bump,
        has_one = bidder,
        close = rent_payer,
    )]
    pub bid: Box<Account<'info, Bid>>,

    #[account(mut, seeds = [BID_VAULT_SEED, bid.asset.as_ref()], bump = bid.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Pinned by `has_one = bidder`; receives the card.
    pub bidder: UncheckedAccount<'info>,

    /// The card's current owner.
    pub seller: Signer<'info>,

    /// CHECK: The seller's USDC associated token account, created if missing.
    #[account(mut)]
    pub seller_usdc: UncheckedAccount<'info>,

    #[account(mut)]
    pub treasury: Box<Account<'info, TokenAccount>>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    /// CHECK: Receives the bid's and the vault's rent.
    #[account(mut, address = bid.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Signer-only PDA holding the permanent transfer delegate.
    #[account(seeds = [AUTHORITY_SEED], bump = config.authority_bump)]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Address-constrained to Metaplex Core.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// `expected_amount` guards the seller against the bid changing between quote
/// and signature.
pub fn handle_accept_bid(ctx: Context<AcceptBid>, expected_amount: u64) -> Result<()> {
    let accounts = ctx.accounts;
    let bid = &accounts.bid;
    require!(
        bid.amount == expected_amount,
        WikiGemsError::UnexpectedAmount
    );
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    require_keys_eq!(owner, accounts.seller.key(), WikiGemsError::NotOwner);
    require_keys_neq!(bid.bidder, owner, WikiGemsError::OwnCard);

    let (proceeds, fee) = split_fee(bid.amount, accounts.config.fee_bps)?;
    let usdc = Usdc {
        mint: &accounts.usdc_mint.to_account_info(),
        token_program: &accounts.token_program.to_account_info(),
        system_program: &accounts.system_program.to_account_info(),
        payer: &accounts.payer.to_account_info(),
    };
    let bump = [bid.bump];
    let seeds: &[&[u8]] = &[BID_SEED, bid.asset.as_ref(), &bump];
    let vault = accounts.vault.to_account_info();
    let bid_info = bid.to_account_info();
    let seller = accounts.seller.to_account_info();
    usdc.ensure_ata(&accounts.seller_usdc, &seller)?;
    token_transfer(&vault, &accounts.seller_usdc, &bid_info, proceeds, &[seeds])?;
    token_transfer(
        &vault,
        &accounts.treasury.to_account_info(),
        &bid_info,
        fee,
        &[seeds],
    )?;
    token_close(&vault, &accounts.rent_payer, &bid_info, &[seeds])?;

    GemTransfer {
        mpl_core_program: &accounts.mpl_core_program,
        asset: &accounts.asset,
        collection: &accounts.collection,
        payer: &accounts.payer.to_account_info(),
        authority: &accounts.authority,
        system_program: &accounts.system_program.to_account_info(),
        authority_bump: accounts.config.authority_bump,
    }
    .to(&accounts.bidder)?;

    emit!(BidAccepted {
        asset: bid.asset,
        seller: owner,
        bidder: bid.bidder,
        amount: bid.amount,
        fee,
    });
    Ok(())
}
