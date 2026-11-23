//! Inactive players. The admin's delegate powers are only reachable through a
//! public notice that the owner can cancel with one signature, and only after
//! `NOTICE_PERIOD_SECONDS`. A reclaim sells the card to its standing best bid
//! and pays the whole amount to the owner; the program has no instruction that
//! moves a card without the owner being paid or without a notice.
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use mpl_core::instructions::BurnV1CpiBuilder;

use crate::{
    constants::*,
    error::WikiGemsError,
    events::{AdminBurned, NoticeCancelled, NoticePosted, Reclaimed},
    gem::{gem_owner, gem_owner_if_live, token_close, token_transfer, GemTransfer, Usdc},
    state::{Bid, Config, Notice},
};

#[derive(Accounts)]
pub struct PostNotice<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin, has_one = collection)]
    pub config: Box<Account<'info, Config>>,

    pub admin: Signer<'info>,

    /// CHECK: Pinned by `has_one = collection`.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(owner = mpl_core::ID)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Notice::INIT_SPACE,
        seeds = [NOTICE_SEED, asset.key().as_ref()],
        bump,
    )]
    pub notice: Box<Account<'info, Notice>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_post_notice(ctx: Context<PostNotice>) -> Result<()> {
    let accounts = ctx.accounts;
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    let posted_at = Clock::get()?.unix_timestamp;
    accounts.notice.set_inner(Notice {
        asset: accounts.asset.key(),
        owner,
        posted_at,
        rent_payer: accounts.payer.key(),
        bump: ctx.bumps.notice,
    });
    emit!(NoticePosted {
        asset: accounts.asset.key(),
        owner,
        posted_at,
        actionable_at: posted_at + NOTICE_PERIOD_SECONDS,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelNotice<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = collection)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Pinned by `has_one = collection`.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Read only to detect a stale notice; may be burned.
    #[account(address = notice.asset)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [NOTICE_SEED, notice.asset.as_ref()],
        bump = notice.bump,
        close = rent_payer,
    )]
    pub notice: Box<Account<'info, Notice>>,

    /// The owner ("I'm still here"), the admin, or anyone once the card has
    /// changed hands.
    pub closer: Signer<'info>,

    /// CHECK: Receives the notice's rent.
    #[account(mut, address = notice.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,
}

pub fn handle_cancel_notice(ctx: Context<CancelNotice>) -> Result<()> {
    let accounts = ctx.accounts;
    let notice = &accounts.notice;
    let closer = accounts.closer.key();
    let stale =
        gem_owner_if_live(&accounts.asset, &accounts.collection.key()) != Some(notice.owner);
    require!(
        stale || closer == notice.owner || closer == accounts.config.admin,
        WikiGemsError::NotAllowed
    );
    emit!(NoticeCancelled {
        asset: notice.asset,
        owner: notice.owner,
        by: closer,
    });
    Ok(())
}

/// Checks that the notice still applies to the current owner and has run its course.
fn require_notice_elapsed(notice: &Notice, owner: Pubkey, now: i64) -> Result<()> {
    require_keys_eq!(owner, notice.owner, WikiGemsError::StaleNotice);
    require!(
        now >= notice.posted_at + NOTICE_PERIOD_SECONDS,
        WikiGemsError::NoticePeriodActive
    );
    Ok(())
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin, has_one = collection, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,

    pub admin: Signer<'info>,

    /// CHECK: Pinned by `has_one = collection`; Core checks the asset belongs to it.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(mut, owner = mpl_core::ID, address = notice.asset)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [NOTICE_SEED, notice.asset.as_ref()],
        bump = notice.bump,
        close = notice_rent_payer,
    )]
    pub notice: Box<Account<'info, Notice>>,

    #[account(
        mut,
        seeds = [BID_SEED, notice.asset.as_ref()],
        bump = bid.bump,
        has_one = bidder,
        close = bid_rent_payer,
    )]
    pub bid: Box<Account<'info, Bid>>,

    #[account(mut, seeds = [BID_VAULT_SEED, notice.asset.as_ref()], bump = bid.vault_bump)]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Pinned by `has_one = bidder`; receives the card.
    pub bidder: UncheckedAccount<'info>,

    /// CHECK: Must be the owner named in the notice; receives the whole bid.
    #[account(address = notice.owner)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: The owner's USDC associated token account, created if missing.
    #[account(mut)]
    pub owner_usdc: UncheckedAccount<'info>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    /// CHECK: Receives the notice's rent.
    #[account(mut, address = notice.rent_payer)]
    pub notice_rent_payer: UncheckedAccount<'info>,

    /// CHECK: Receives the bid's and the vault's rent.
    #[account(mut, address = bid.rent_payer)]
    pub bid_rent_payer: UncheckedAccount<'info>,

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

/// Sells a dormant card to its standing best bid. No fee: the owner receives
/// the full amount.
pub fn handle_reclaim(ctx: Context<Reclaim>, expected_amount: u64) -> Result<()> {
    let accounts = ctx.accounts;
    let bid = &accounts.bid;
    let now = Clock::get()?.unix_timestamp;
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    require_notice_elapsed(&accounts.notice, owner, now)?;
    require!(
        bid.amount == expected_amount,
        WikiGemsError::UnexpectedAmount
    );
    require!(
        now >= bid.placed_at + RECLAIM_BID_MIN_AGE_SECONDS,
        WikiGemsError::BidTooRecent
    );
    require_keys_neq!(bid.bidder, owner, WikiGemsError::OwnCard);

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
    usdc.ensure_ata(&accounts.owner_usdc, &accounts.owner)?;
    token_transfer(
        &vault,
        &accounts.owner_usdc,
        &bid_info,
        bid.amount,
        &[seeds],
    )?;
    token_close(&vault, &accounts.bid_rent_payer, &bid_info, &[seeds])?;

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

    emit!(Reclaimed {
        asset: bid.asset,
        owner,
        bidder: bid.bidder,
        amount: bid.amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AdminBurn<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin, has_one = collection)]
    pub config: Box<Account<'info, Config>>,

    pub admin: Signer<'info>,

    /// Receives the asset's reclaimed rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Signer-only PDA holding the permanent burn delegate.
    #[account(seeds = [AUTHORITY_SEED], bump = config.authority_bump)]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Pinned by `has_one = collection`; Core checks the asset belongs to it.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Owned by Core; `gem_owner` checks the layout and the collection.
    #[account(mut, owner = mpl_core::ID, address = notice.asset)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [NOTICE_SEED, notice.asset.as_ref()],
        bump = notice.bump,
        close = rent_payer,
    )]
    pub notice: Box<Account<'info, Notice>>,

    /// CHECK: Receives the notice's rent.
    #[account(mut, address = notice.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,

    /// CHECK: Address-constrained to Metaplex Core.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Burns a card after an uncontested notice, e.g. for a legal takedown. The
/// owner is not paid on-chain; compensation is an off-chain policy decision.
pub fn handle_admin_burn(ctx: Context<AdminBurn>) -> Result<()> {
    let accounts = ctx.accounts;
    let owner = gem_owner(&accounts.asset, &accounts.collection.key())?;
    require_notice_elapsed(&accounts.notice, owner, Clock::get()?.unix_timestamp)?;

    BurnV1CpiBuilder::new(&accounts.mpl_core_program.to_account_info())
        .asset(&accounts.asset.to_account_info())
        .collection(Some(&accounts.collection.to_account_info()))
        .payer(&accounts.payer.to_account_info())
        .authority(Some(&accounts.authority.to_account_info()))
        .system_program(Some(&accounts.system_program.to_account_info()))
        .invoke_signed(&[&[AUTHORITY_SEED, &[accounts.config.authority_bump]]])?;

    emit!(AdminBurned {
        asset: accounts.asset.key(),
        owner
    });
    Ok(())
}
