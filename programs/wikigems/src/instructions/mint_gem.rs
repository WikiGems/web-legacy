use anchor_lang::prelude::*;
use mpl_core::instructions::CreateV2CpiBuilder;

use crate::{constants::*, error::WikiGemsError, events::GemMinted, state::Config};

#[derive(Accounts)]
#[instruction(gem_id: u64)]
pub struct MintGem<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = mint_authority,
        has_one = collection,
    )]
    pub config: Account<'info, Config>,

    pub mint_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Signer-only PDA, the collection's update authority.
    #[account(seeds = [AUTHORITY_SEED], bump = config.authority_bump)]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Pinned by `has_one = collection`.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Created by Metaplex Core; the gem ID seeds pin its address.
    #[account(mut, seeds = [GEM_SEED, &gem_id.to_le_bytes()], bump)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Any address can receive a gem, including PDAs and multisigs.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: Address-constrained to Metaplex Core.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_mint_gem(
    ctx: Context<MintGem>,
    gem_id: u64,
    name: String,
    uri: String,
) -> Result<()> {
    require!(name.len() <= MAX_NAME_LEN, WikiGemsError::NameTooLong);
    require!(uri.len() <= MAX_URI_LEN, WikiGemsError::UriTooLong);

    let accounts = ctx.accounts;
    // Burned Core assets keep a tombstone, so a burned gem cannot be re-minted either.
    require!(
        accounts.asset.data_is_empty(),
        WikiGemsError::GemAlreadyMinted
    );

    let gem_id_bytes = gem_id.to_le_bytes();
    let asset_seeds: &[&[u8]] = &[GEM_SEED, &gem_id_bytes, &[ctx.bumps.asset]];

    // Core creates the asset with `system_program::create_account`, which fails
    // if the address already holds lamports. Anyone can send lamports to a
    // future gem address to block its mint, so sweep them to the payer first.
    // Only this program can sign for the PDA, so nobody else can assign or
    // allocate it; lamports are the only thing an outsider can put there.
    let stray_lamports = accounts.asset.lamports();
    if stray_lamports > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                anchor_lang::system_program::ID,
                anchor_lang::system_program::Transfer {
                    from: accounts.asset.to_account_info(),
                    to: accounts.payer.to_account_info(),
                },
                &[asset_seeds],
            ),
            stray_lamports,
        )?;
    }

    CreateV2CpiBuilder::new(&accounts.mpl_core_program.to_account_info())
        .asset(&accounts.asset.to_account_info())
        .collection(Some(&accounts.collection.to_account_info()))
        .authority(Some(&accounts.authority.to_account_info()))
        .payer(&accounts.payer.to_account_info())
        .owner(Some(&accounts.owner.to_account_info()))
        .system_program(&accounts.system_program.to_account_info())
        .name(name)
        .uri(uri)
        .invoke_signed(&[
            asset_seeds,
            &[AUTHORITY_SEED, &[accounts.config.authority_bump]],
        ])?;

    emit!(GemMinted {
        gem_id,
        asset: accounts.asset.key(),
        owner: accounts.owner.key()
    });
    Ok(())
}
