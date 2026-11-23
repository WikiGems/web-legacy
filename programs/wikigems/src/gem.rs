//! Helpers shared by the marketplace and dormancy instructions.
use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};
use mpl_core::{
    accounts::BaseAssetV1,
    instructions::TransferV1CpiBuilder,
    types::{Key, UpdateAuthority},
};

use crate::{constants::*, error::WikiGemsError};

/// Returns the owner of a live WikiGems card. Fails for burned assets and for
/// Core assets outside the WikiGems collection. Callers must also constrain the
/// account's owner to Metaplex Core, otherwise anyone could forge the bytes.
pub fn gem_owner(asset: &AccountInfo, collection: &Pubkey) -> Result<Pubkey> {
    let base = BaseAssetV1::try_from(asset).map_err(|_| error!(WikiGemsError::InvalidAsset))?;
    require!(
        base.key == Key::AssetV1
            && base.update_authority == UpdateAuthority::Collection(*collection),
        WikiGemsError::InvalidAsset
    );
    Ok(base.owner)
}

/// Like `gem_owner`, but a burned or unreadable card yields `None`, so stale
/// listings and notices can still be closed.
pub fn gem_owner_if_live(asset: &AccountInfo, collection: &Pubkey) -> Option<Pubkey> {
    if asset.owner != &mpl_core::ID {
        return None;
    }
    gem_owner(asset, collection).ok()
}

pub struct GemTransfer<'a, 'info> {
    pub mpl_core_program: &'a AccountInfo<'info>,
    pub asset: &'a AccountInfo<'info>,
    pub collection: &'a AccountInfo<'info>,
    pub payer: &'a AccountInfo<'info>,
    pub authority: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub authority_bump: u8,
}

impl<'info> GemTransfer<'_, 'info> {
    /// Moves the card through the collection's permanent transfer delegate.
    pub fn to(&self, new_owner: &AccountInfo<'info>) -> Result<()> {
        TransferV1CpiBuilder::new(self.mpl_core_program)
            .asset(self.asset)
            .collection(Some(self.collection))
            .payer(self.payer)
            .authority(Some(self.authority))
            .new_owner(new_owner)
            .system_program(Some(self.system_program))
            .invoke_signed(&[&[AUTHORITY_SEED, &[self.authority_bump]]])?;
        Ok(())
    }
}

/// Splits `amount` into (proceeds, fee).
pub fn split_fee(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = u128::from(amount) * u128::from(fee_bps) / u128::from(BPS_DENOMINATOR);
    let fee = u64::try_from(fee).map_err(|_| error!(WikiGemsError::Overflow))?;
    Ok((amount - fee, fee))
}

pub struct Usdc<'a, 'info> {
    pub mint: &'a AccountInfo<'info>,
    pub token_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub payer: &'a AccountInfo<'info>,
}

impl<'info> Usdc<'_, 'info> {
    /// Creates `wallet`'s USDC associated token account if it is missing (the
    /// payer funds the rent). Payouts always go to this address, so a recipient
    /// who closed their account cannot block a sale or a refund.
    pub fn ensure_ata(&self, ata: &AccountInfo<'info>, wallet: &AccountInfo<'info>) -> Result<()> {
        let expected = associated_token::get_associated_token_address(wallet.key, self.mint.key);
        require_keys_eq!(*ata.key, expected, WikiGemsError::InvalidTokenAccount);
        associated_token::create_idempotent(CpiContext::new(
            associated_token::ID,
            associated_token::Create {
                payer: self.payer.clone(),
                associated_token: ata.clone(),
                authority: wallet.clone(),
                mint: self.mint.clone(),
                system_program: self.system_program.clone(),
                token_program: self.token_program.clone(),
            },
        ))
    }
}

/// SPL Token transfer; a zero amount is a no-op.
pub fn token_transfer<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            token::Transfer {
                from: from.clone(),
                to: to.clone(),
                authority: authority.clone(),
            },
            signer_seeds,
        ),
        amount,
    )
}

/// Closes a program-owned token account, returning its rent to `destination`.
pub fn token_close<'info>(
    account: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token::close_account(CpiContext::new_with_signer(
        token::ID,
        token::CloseAccount {
            account: account.clone(),
            destination: destination.clone(),
            authority: authority.clone(),
        },
        signer_seeds,
    ))
}
