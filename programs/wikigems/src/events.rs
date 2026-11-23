//! Events are the backend indexer's feed: it mirrors listings, bids and
//! notices, and sends notifications (e.g. "your card received a notice").
use anchor_lang::prelude::*;

#[event]
pub struct GemMinted {
    pub gem_id: u64,
    pub asset: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct Listed {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct ListingCancelled {
    pub asset: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct Sold {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub fee: u64,
}

#[event]
pub struct BidPlaced {
    pub asset: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    /// The bidder who was refunded, if this bid replaced another.
    pub outbid: Option<Pubkey>,
}

#[event]
pub struct BidCancelled {
    pub asset: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BidAccepted {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct NoticePosted {
    pub asset: Pubkey,
    pub owner: Pubkey,
    pub posted_at: i64,
    /// Earliest time of a reclaim or burn.
    pub actionable_at: i64,
}

#[event]
pub struct NoticeCancelled {
    pub asset: Pubkey,
    pub owner: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct Reclaimed {
    pub asset: Pubkey,
    pub owner: Pubkey,
    pub bidder: Pubkey,
    /// Paid in full to the former owner; reclaims carry no fee.
    pub amount: u64,
}

#[event]
pub struct AdminBurned {
    pub asset: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct AdminChanged {
    pub previous: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct MarketConfigChanged {
    pub treasury: Pubkey,
    pub fee_bps: u16,
}
