use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::{
    constants::*,
    error::WikiGemsError,
    events::{AdminChanged, MarketConfigChanged},
    state::Config,
};

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

pub fn handle_set_mint_authority(ctx: Context<AdminOnly>, mint_authority: Pubkey) -> Result<()> {
    ctx.accounts.config.mint_authority = mint_authority;
    Ok(())
}

pub fn handle_propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = Some(new_admin);
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub new_admin: Signer<'info>,
}

pub fn handle_accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let pending = config
        .pending_admin
        .ok_or(error!(WikiGemsError::NoPendingAdmin))?;
    require_keys_eq!(
        pending,
        ctx.accounts.new_admin.key(),
        WikiGemsError::NotPendingAdmin
    );

    let previous = config.admin;
    config.admin = pending;
    config.pending_admin = None;
    emit!(AdminChanged {
        previous,
        admin: pending
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetMarketConfig<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(token::mint = config.usdc_mint)]
    pub treasury: Account<'info, TokenAccount>,
}

/// Existing listings keep the fee they were created with.
pub fn handle_set_market_config(ctx: Context<SetMarketConfig>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, WikiGemsError::FeeTooHigh);
    let config = &mut ctx.accounts.config;
    config.treasury = ctx.accounts.treasury.key();
    config.fee_bps = fee_bps;
    emit!(MarketConfigChanged {
        treasury: config.treasury,
        fee_bps
    });
    Ok(())
}
