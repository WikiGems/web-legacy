use anchor_lang::prelude::*;

#[error_code]
pub enum WikiGemsError {
    #[msg("Name exceeds the maximum length")]
    NameTooLong,
    #[msg("URI exceeds the maximum length")]
    UriTooLong,
    #[msg("This gem has already been minted")]
    GemAlreadyMinted,
    #[msg("No admin transfer is pending")]
    NoPendingAdmin,
    #[msg("Signer is not the pending admin")]
    NotPendingAdmin,
    #[msg("Account is not a WikiGems card")]
    InvalidAsset,
    #[msg("Fee exceeds the maximum")]
    FeeTooHigh,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Signer does not own this card")]
    NotOwner,
    #[msg("The seller no longer owns this card")]
    StaleListing,
    #[msg("Price or amount differs from what the signer expected")]
    UnexpectedAmount,
    #[msg("A new bid must be higher than the current one")]
    BidTooLow,
    #[msg("Owners cannot bid on or buy their own card")]
    OwnCard,
    #[msg("Signer may not cancel this")]
    NotAllowed,
    #[msg("Token account is not the expected associated token account")]
    InvalidTokenAccount,
    #[msg("The card has changed hands since the notice was posted")]
    StaleNotice,
    #[msg("The notice period has not elapsed")]
    NoticePeriodActive,
    #[msg("The bid is too recent to be used for a reclaim")]
    BidTooRecent,
    #[msg("Arithmetic overflow")]
    Overflow,
}
