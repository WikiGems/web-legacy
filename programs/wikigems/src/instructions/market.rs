//! Escrowless listings: the seller keeps the card until someone buys it.
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::*,
    error::WikiGemsError,
    events::{Listed, ListingCancelled, Sold},
    gem::{gem_owner, gem_owner_if_live, split_fee, token_transfer, GemTransfer, Usdc},
    state::{Config, Listing},
};

#[derive(Accounts)]
pub struct List<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = collection)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Pinned by `has_one = collection`.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(owner = mpl_core::ID)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump,
    )]
    pub listing: Box<Account<'info, Listing>>,

    pub seller: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_list(ctx: Context<List>, price: u64) -> Result<()> {
    require!(price > 0, WikiGemsError::ZeroAmount);
    let accounts = ctx.accounts;
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    require_keys_eq!(owner, accounts.seller.key(), WikiGemsError::NotOwner);

    accounts.listing.set_inner(Listing {
        asset: accounts.asset.key(),
        seller: owner,
        price,
        fee_bps: accounts.config.fee_bps,
        rent_payer: accounts.payer.key(),
        created_at: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.listing,
    });
    emit!(Listed {
        asset: accounts.asset.key(),
        seller: owner,
        price
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateListing<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.asset.as_ref()],
        bump = listing.bump,
        has_one = seller,
    )]
    pub listing: Box<Account<'info, Listing>>,

    pub seller: Signer<'info>,
}

pub fn handle_update_listing(ctx: Context<UpdateListing>, price: u64) -> Result<()> {
    require!(price > 0, WikiGemsError::ZeroAmount);
    let listing = &mut ctx.accounts.listing;
    listing.price = price;
    emit!(Listed {
        asset: listing.asset,
        seller: listing.seller,
        price
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = collection)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Pinned by `has_one = collection`.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Read only to detect a stale listing; may be burned.
    #[account(address = listing.asset)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LISTING_SEED, listing.asset.as_ref()],
        bump = listing.bump,
        close = rent_payer,
    )]
    pub listing: Box<Account<'info, Listing>>,

    /// The seller, or anyone once the seller no longer owns the card.
    pub closer: Signer<'info>,

    /// CHECK: Receives the listing's rent.
    #[account(mut, address = listing.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,
}

pub fn handle_cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    let accounts = ctx.accounts;
    let seller = accounts.listing.seller;
    let stale = gem_owner_if_live(&accounts.asset, &accounts.collection.key()) != Some(seller);
    require!(
        stale || accounts.closer.key() == seller,
        WikiGemsError::NotAllowed
    );
    emit!(ListingCancelled {
        asset: accounts.listing.asset,
        seller
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = collection, has_one = treasury, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Pinned by `has_one = collection`; Core checks the asset belongs to it.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(mut, owner = mpl_core::ID, address = listing.asset)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [LISTING_SEED, listing.asset.as_ref()],
        bump = listing.bump,
        has_one = seller,
        close = rent_payer,
    )]
    pub listing: Box<Account<'info, Listing>>,

    /// CHECK: Pinned by `has_one = seller`; receives the card's proceeds.
    pub seller: UncheckedAccount<'info>,

    /// CHECK: The seller's USDC associated token account, created if missing.
    #[account(mut)]
    pub seller_usdc: UncheckedAccount<'info>,

    pub buyer: Signer<'info>,

    #[account(mut, token::mint = usdc_mint, token::authority = buyer)]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub treasury: Box<Account<'info, TokenAccount>>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    /// CHECK: Receives the listing's rent.
    #[account(mut, address = listing.rent_payer)]
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

/// `expected_price` guards the buyer against a price change between quote and
/// signature.
pub fn handle_buy(ctx: Context<Buy>, expected_price: u64) -> Result<()> {
    let accounts = ctx.accounts;
    let listing = &accounts.listing;
    require!(
        listing.price == expected_price,
        WikiGemsError::UnexpectedAmount
    );
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    require_keys_eq!(owner, listing.seller, WikiGemsError::StaleListing);
    require_keys_neq!(accounts.buyer.key(), owner, WikiGemsError::OwnCard);

    let (proceeds, fee) = split_fee(listing.price, listing.fee_bps)?;
    let usdc = Usdc {
        mint: &accounts.usdc_mint.to_account_info(),
        token_program: &accounts.token_program.to_account_info(),
        system_program: &accounts.system_program.to_account_info(),
        payer: &accounts.payer.to_account_info(),
    };
    let buyer_usdc = accounts.buyer_usdc.to_account_info();
    let buyer = accounts.buyer.to_account_info();
    usdc.ensure_ata(&accounts.seller_usdc, &accounts.seller)?;
    token_transfer(&buyer_usdc, &accounts.seller_usdc, &buyer, proceeds, &[])?;
    token_transfer(
        &buyer_usdc,
        &accounts.treasury.to_account_info(),
        &buyer,
        fee,
        &[],
    )?;

    GemTransfer {
        mpl_core_program: &accounts.mpl_core_program,
        asset: &accounts.asset,
        collection: &accounts.collection,
        payer: &accounts.payer.to_account_info(),
        authority: &accounts.authority,
        system_program: &accounts.system_program.to_account_info(),
        authority_bump: accounts.config.authority_bump,
    }
    .to(&buyer)?;

    emit!(Sold {
        asset: listing.asset,
        seller: owner,
        buyer: buyer.key(),
        price: listing.price,
        fee,
    });
    Ok(())
}
