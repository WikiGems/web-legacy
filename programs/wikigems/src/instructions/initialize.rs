use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use mpl_core::{
    instructions::CreateCollectionV2CpiBuilder,
    types::{
        PermanentBurnDelegate, PermanentTransferDelegate, Plugin, PluginAuthority,
        PluginAuthorityPair,
    },
};

use crate::{constants::*, error::WikiGemsError, program::WikigemsProgram, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub admin: Pubkey,
    pub mint_authority: Pubkey,
    pub collection_name: String,
    pub collection_uri: String,
    pub fee_bps: u16,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: Signer-only PDA; never holds data.
    #[account(seeds = [AUTHORITY_SEED], bump)]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Created by Metaplex Core in this instruction; the seeds pin its address.
    #[account(mut, seeds = [COLLECTION_SEED], bump)]
    pub collection: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// The settlement currency. Must be USDC; the deploy script checks the address.
    pub usdc_mint: Account<'info, Mint>,

    #[account(token::mint = usdc_mint)]
    pub treasury: Account<'info, TokenAccount>,

    /// Must be the program's upgrade authority.
    pub deployer: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, WikigemsProgram>,

    #[account(constraint = program_data.upgrade_authority_address == Some(deployer.key()))]
    pub program_data: Account<'info, ProgramData>,

    /// CHECK: Address-constrained to Metaplex Core.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(
        args.collection_name.len() <= MAX_NAME_LEN,
        WikiGemsError::NameTooLong
    );
    require!(
        args.collection_uri.len() <= MAX_URI_LEN,
        WikiGemsError::UriTooLong
    );

    require!(args.fee_bps <= MAX_FEE_BPS, WikiGemsError::FeeTooHigh);

    let accounts = ctx.accounts;
    let authority_key = accounts.authority.key();
    let delegate = || {
        Some(PluginAuthority::Address {
            address: authority_key,
        })
    };

    // Permanent plugins can only be attached when the collection is created.
    CreateCollectionV2CpiBuilder::new(&accounts.mpl_core_program.to_account_info())
        .collection(&accounts.collection.to_account_info())
        .update_authority(Some(&accounts.authority.to_account_info()))
        .payer(&accounts.payer.to_account_info())
        .system_program(&accounts.system_program.to_account_info())
        .name(args.collection_name)
        .uri(args.collection_uri)
        .plugins(vec![
            PluginAuthorityPair {
                plugin: Plugin::PermanentTransferDelegate(PermanentTransferDelegate {}),
                authority: delegate(),
            },
            PluginAuthorityPair {
                plugin: Plugin::PermanentBurnDelegate(PermanentBurnDelegate {}),
                authority: delegate(),
            },
        ])
        .invoke_signed(&[&[COLLECTION_SEED, &[ctx.bumps.collection]]])?;

    accounts.config.set_inner(Config {
        version: CONFIG_VERSION,
        admin: args.admin,
        pending_admin: None,
        mint_authority: args.mint_authority,
        collection: accounts.collection.key(),
        bump: ctx.bumps.config,
        authority_bump: ctx.bumps.authority,
        collection_bump: ctx.bumps.collection,
        usdc_mint: accounts.usdc_mint.key(),
        treasury: accounts.treasury.key(),
        fee_bps: args.fee_bps,
        reserved: [0; 62],
    });
    Ok(())
}
