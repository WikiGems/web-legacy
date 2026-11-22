use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub version: u8,
    /// Posts dormancy notices, reclaims and burns after the notice period, and
    /// updates config. Intended to become a multisig vault before mainnet.
    pub admin: Pubkey,
    /// Set by `propose_admin`; becomes `admin` only when it signs `accept_admin`.
    pub pending_admin: Option<Pubkey>,
    /// Online server key that co-signs mints. It cannot move or burn assets.
    pub mint_authority: Pubkey,
    pub collection: Pubkey,
    pub bump: u8,
    pub authority_bump: u8,
    pub collection_bump: u8,
    /// The only currency the marketplace settles in.
    pub usdc_mint: Pubkey,
    /// USDC token account that receives marketplace fees.
    pub treasury: Pubkey,
    /// Fee on sales and accepted bids, in basis points, capped by `MAX_FEE_BPS`.
    pub fee_bps: u16,
    /// Space for later settings without a realloc migration.
    pub reserved: [u8; 62],
}

/// An escrowless sale offer. The seller keeps the card; `buy` checks the
/// seller still owns it and settles through the collection's transfer delegate.
#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub asset: Pubkey,
    pub seller: Pubkey,
    /// USDC minor units (6 decimals).
    pub price: u64,
    /// Fee at listing time, so a later fee change cannot surprise the seller.
    pub fee_bps: u16,
    /// Receives the account's rent when the listing closes.
    pub rent_payer: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

/// The single best public bid on a card. A higher bid replaces it and refunds
/// the previous bidder in the same transaction, so this is always the highest
/// outstanding offer. The USDC sits in the `["bid_vault", asset]` token
/// account, whose authority is this PDA.
#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub asset: Pubkey,
    pub bidder: Pubkey,
    /// USDC minor units (6 decimals).
    pub amount: u64,
    pub rent_payer: Pubkey,
    /// When this bidder placed the bid; outbidding resets it.
    pub placed_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// A public dormancy notice on a card. After `NOTICE_PERIOD_SECONDS`, the
/// admin can sell the card to its highest bid (all proceeds to the owner) or
/// burn it. The owner cancels it with one signature, and it is void as soon as
/// the card changes hands.
#[account]
#[derive(InitSpace)]
pub struct Notice {
    pub asset: Pubkey,
    /// Owner when the notice was posted.
    pub owner: Pubkey,
    pub posted_at: i64,
    pub rent_payer: Pubkey,
    pub bump: u8,
}
