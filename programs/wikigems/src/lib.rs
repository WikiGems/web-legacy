//! WikiGems on-chain program.
//!
//! Every card is a Metaplex Core asset in one collection. The program derives
//! each asset's address from its WikiGems `gem_id`, so a gem can be minted only
//! once. A program PDA is the collection's update authority and holds its
//! permanent transfer and burn delegates. The program uses them to settle
//! escrowless sales and accepted bids, and to reclaim or burn dormant cards,
//! which the admin can only do after a public notice the owner can cancel.
#![allow(unexpected_cfgs)]

pub mod constants;
pub mod error;
pub mod events;
pub mod gem;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("3KBQ1Y9YZbKmYKhnXM1u8fcEBHEtizgW3hcBZSYnuUjL");

#[program]
pub mod wikigems_program {
    use super::*;

    /// One-time setup. Only the program's upgrade authority can call it, so
    /// nobody can front-run the deployment and install themselves as admin.
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::handle_initialize(ctx, args)
    }

    /// Mints gem `gem_id` to `owner`. Requires the mint authority's signature;
    /// the payer (normally the sponsor) funds rent and fees.
    pub fn mint_gem(ctx: Context<MintGem>, gem_id: u64, name: String, uri: String) -> Result<()> {
        instructions::mint_gem::handle_mint_gem(ctx, gem_id, name, uri)
    }

    /// Lists a card for sale at `price` USDC minor units. The seller keeps it.
    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        instructions::market::handle_list(ctx, price)
    }

    pub fn update_listing(ctx: Context<UpdateListing>, price: u64) -> Result<()> {
        instructions::market::handle_update_listing(ctx, price)
    }

    /// The seller cancels; anyone can close a listing whose seller no longer
    /// owns the card.
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        instructions::market::handle_cancel_listing(ctx)
    }

    /// Pays the seller (minus the listing's fee) and moves the card to the buyer.
    pub fn buy(ctx: Context<Buy>, expected_price: u64) -> Result<()> {
        instructions::market::handle_buy(ctx, expected_price)
    }

    /// Escrows `amount` USDC as the card's best bid, refunding any lower bid.
    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        instructions::bids::handle_place_bid(ctx, amount)
    }

    pub fn cancel_bid(ctx: Context<CancelBid>) -> Result<()> {
        instructions::bids::handle_cancel_bid(ctx)
    }

    /// The owner sells the card to its best bid.
    pub fn accept_bid(ctx: Context<AcceptBid>, expected_amount: u64) -> Result<()> {
        instructions::bids::handle_accept_bid(ctx, expected_amount)
    }

    /// Admin: starts the public notice period on a dormant player's card.
    pub fn post_notice(ctx: Context<PostNotice>) -> Result<()> {
        instructions::dormancy::handle_post_notice(ctx)
    }

    /// The owner (or the admin) cancels a notice; anyone can close a stale one.
    pub fn cancel_notice(ctx: Context<CancelNotice>) -> Result<()> {
        instructions::dormancy::handle_cancel_notice(ctx)
    }

    /// Admin, after the notice period: sells the card to its standing best bid,
    /// paying the full amount to the owner.
    pub fn reclaim(ctx: Context<Reclaim>, expected_amount: u64) -> Result<()> {
        instructions::dormancy::handle_reclaim(ctx, expected_amount)
    }

    /// Admin, after the notice period: burns the card.
    pub fn admin_burn(ctx: Context<AdminBurn>) -> Result<()> {
        instructions::dormancy::handle_admin_burn(ctx)
    }

    pub fn set_market_config(ctx: Context<SetMarketConfig>, fee_bps: u16) -> Result<()> {
        instructions::config::handle_set_market_config(ctx, fee_bps)
    }

    pub fn set_mint_authority(ctx: Context<AdminOnly>, mint_authority: Pubkey) -> Result<()> {
        instructions::config::handle_set_mint_authority(ctx, mint_authority)
    }

    /// First step of a two-step admin handover, so a typo cannot lock the
    /// program out of its admin powers.
    pub fn propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        instructions::config::handle_propose_admin(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::config::handle_accept_admin(ctx)
    }
}
