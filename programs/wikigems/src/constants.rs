//! PDA seeds, limits and timing rules. Seeds are part of the on-chain ABI:
//! changing one changes every derived address, so treat them as frozen once
//! deployed. The timing rules are what players rely on; the admin cannot change
//! them without a program upgrade.

/// Global configuration account.
pub const CONFIG_SEED: &[u8] = b"config";
/// Signer-only PDA. It is the collection's update authority and holds the
/// collection's permanent transfer and burn delegates.
pub const AUTHORITY_SEED: &[u8] = b"authority";
/// The single Metaplex Core collection that every gem belongs to.
pub const COLLECTION_SEED: &[u8] = b"collection";
/// Per-gem asset address: `["gem", gem_id.to_le_bytes()]`. Deriving the asset
/// from the gem ID is what makes each card a 1-of-1 on-chain.
pub const GEM_SEED: &[u8] = b"gem";
/// `["listing", asset]`: at most one listing per card.
pub const LISTING_SEED: &[u8] = b"listing";
/// `["bid", asset]`: at most one (the best) bid per card.
pub const BID_SEED: &[u8] = b"bid";
/// `["bid_vault", asset]`: USDC token account escrowing the bid.
pub const BID_VAULT_SEED: &[u8] = b"bid_vault";
/// `["notice", asset]`: dormancy notice.
pub const NOTICE_SEED: &[u8] = b"notice";

pub const CONFIG_VERSION: u8 = 1;

/// Upper bounds keep sponsored rent predictable. Core stores both strings
/// on-chain, so every byte here is paid for at mint time.
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_URI_LEN: usize = 96;

pub const BPS_DENOMINATOR: u64 = 10_000;
/// The admin can set the marketplace fee, but never above 10%.
pub const MAX_FEE_BPS: u16 = 1_000;

const DAY: i64 = 24 * 60 * 60;
/// Minimum time between a dormancy notice and a reclaim or burn. The off-chain
/// policy (6 months of inactivity, SMS, email and in-app notices) comes first.
pub const NOTICE_PERIOD_SECONDS: i64 = 30 * DAY;
/// A bid must have stood this long before it can be used for a reclaim, so the
/// market has time to outbid a lowball offer.
pub const RECLAIM_BID_MIN_AGE_SECONDS: i64 = 7 * DAY;
