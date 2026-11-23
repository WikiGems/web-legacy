//! Public bids: `place_bid`, `cancel_bid`, `accept_bid`.

mod common;

use common::*;
use solana_signer::Signer;

/// Alice owns gem 1, unlisted. Bob and Carol hold 100 USDC each.
fn world() -> World {
    let mut world = World::initialized();
    world.mint(1, world.alice.pubkey()).unwrap();
    let (bob, carol) = (world.bob.pubkey(), world.carol.pubkey());
    world.set_usdc(bob, 100 * USDC);
    world.set_usdc(carol, 100 * USDC);
    world
}

#[test]
fn a_bid_escrows_usdc_on_an_unlisted_card() {
    let mut world = world();
    let bob = world.bob.insecure_clone();
    world.place_bid(1, &bob, 20 * USDC).expect("bid");

    let bid = world.bid(gem_pda(1));
    assert_eq!((bid.bidder, bid.amount), (bob.pubkey(), 20 * USDC));
    assert_eq!(world.token_balance(&vault_pda(gem_pda(1))), 20 * USDC);
    assert_eq!(world.usdc(bob.pubkey()), 80 * USDC);
    assert_eq!(world.asset(1).base.owner, world.alice.pubkey());
}

#[test]
fn a_higher_bid_refunds_the_previous_bidder() {
    let mut world = world();
    let (bob, carol) = (world.bob.insecure_clone(), world.carol.insecure_clone());
    world.place_bid(1, &bob, 20 * USDC).unwrap();

    assert_fails_with(world.place_bid(1, &carol, 20 * USDC), "BidTooLow");
    world.place_bid(1, &carol, 25 * USDC).expect("outbid");

    assert_eq!(
        world.usdc(bob.pubkey()),
        100 * USDC,
        "Bob is refunded in full"
    );
    assert_eq!(world.usdc(carol.pubkey()), 75 * USDC);
    assert_eq!(world.token_balance(&vault_pda(gem_pda(1))), 25 * USDC);
    assert_eq!(world.bid(gem_pda(1)).bidder, carol.pubkey());
}

#[test]
fn bidders_can_raise_their_own_bid() {
    let mut world = world();
    let bob = world.bob.insecure_clone();
    world.place_bid(1, &bob, 20 * USDC).unwrap();
    world.place_bid(1, &bob, 30 * USDC).expect("raise");
    assert_eq!(world.usdc(bob.pubkey()), 70 * USDC);
    assert_eq!(world.token_balance(&vault_pda(gem_pda(1))), 30 * USDC);
}

/// Refunds go to the previous bidder's associated token account, recreated if
/// needed, so closing it cannot freeze the card's bid slot.
#[test]
fn closing_your_token_account_cannot_block_higher_bids() {
    let mut world = world();
    let (bob, carol) = (world.bob.insecure_clone(), world.carol.insecure_clone());
    world.place_bid(1, &bob, 100 * USDC).unwrap();
    let bob_ata = world.ata(bob.pubkey());
    world.svm.set_account(bob_ata, Default::default()).unwrap();
    assert!(!world.exists(&bob_ata));

    world.set_usdc(carol.pubkey(), 200 * USDC);
    world.place_bid(1, &carol, 150 * USDC).expect("outbid");
    assert_eq!(world.usdc(bob.pubkey()), 100 * USDC);
}

#[test]
fn an_outbid_must_refund_the_actual_previous_bidder() {
    let mut world = world();
    let (bob, carol) = (world.bob.insecure_clone(), world.carol.insecure_clone());
    world.place_bid(1, &bob, 20 * USDC).unwrap();

    let mut outbid = world.place_bid_ix(1, carol.pubkey(), 30 * USDC);
    // Swap the refund target (previous_bidder, previous_bidder_usdc) for Carol herself.
    outbid.accounts[7].pubkey = carol.pubkey();
    outbid.accounts[8].pubkey = world.ata(carol.pubkey());
    assert_fails_with(world.send(&[outbid], &[&carol]), "NotAllowed");
    assert_eq!(world.bid(gem_pda(1)).bidder, bob.pubkey());
}

#[test]
fn owners_cannot_bid_on_their_own_card() {
    let mut world = world();
    let alice = world.alice.insecure_clone();
    world.set_usdc(alice.pubkey(), 100 * USDC);
    assert_fails_with(world.place_bid(1, &alice, USDC), "OwnCard");
}

#[test]
fn cancelling_returns_the_usdc_and_the_rent() {
    let mut world = world();
    let (bob, mallory) = (world.bob.insecure_clone(), world.mallory.insecure_clone());
    world.place_bid(1, &bob, 20 * USDC).unwrap();
    assert!(
        world.cancel_bid(1, &mallory).is_err(),
        "only the bidder cancels"
    );

    let sponsor_before = world.lamports(&world.sponsor.pubkey());
    world.cancel_bid(1, &bob).expect("cancel");
    assert_eq!(world.usdc(bob.pubkey()), 100 * USDC);
    assert!(!world.exists(&bid_pda(gem_pda(1))));
    assert!(!world.exists(&vault_pda(gem_pda(1))));
    assert!(world.lamports(&world.sponsor.pubkey()) > sponsor_before);

    // The slot is reusable.
    world.place_bid(1, &bob, 5 * USDC).expect("bid again");
}

#[test]
fn accepting_pays_the_owner_minus_the_fee_and_moves_the_card() {
    let mut world = world();
    let (alice, bob) = (world.alice.insecure_clone(), world.bob.insecure_clone());
    world.place_bid(1, &bob, 40 * USDC).unwrap();

    assert_fails_with(world.accept_bid(1, &alice, 39 * USDC), "UnexpectedAmount");
    world.accept_bid(1, &alice, 40 * USDC).expect("accept");

    let fee = 40 * USDC * u64::from(FEE_BPS) / 10_000;
    assert_eq!(world.asset(1).base.owner, bob.pubkey());
    assert_eq!(world.usdc(alice.pubkey()), 40 * USDC - fee);
    assert_eq!(world.token_balance(&world.treasury()), fee);
    assert!(!world.exists(&bid_pda(gem_pda(1))));
    assert!(!world.exists(&vault_pda(gem_pda(1))));
}

#[test]
fn only_the_owner_can_accept() {
    let mut world = world();
    let (bob, mallory) = (world.bob.insecure_clone(), world.mallory.insecure_clone());
    world.place_bid(1, &bob, 40 * USDC).unwrap();
    assert_fails_with(world.accept_bid(1, &mallory, 40 * USDC), "NotOwner");
    assert_eq!(world.asset(1).base.owner, world.alice.pubkey());
    assert_eq!(world.token_balance(&vault_pda(gem_pda(1))), 40 * USDC);
}

#[test]
fn a_listed_card_can_be_sold_to_a_bid_and_the_listing_goes_stale() {
    let mut world = world();
    let (alice, bob, mallory) = (
        world.alice.insecure_clone(),
        world.bob.insecure_clone(),
        world.mallory.insecure_clone(),
    );
    world.list(1, &alice, 50 * USDC).unwrap();
    world.place_bid(1, &bob, 45 * USDC).unwrap();
    world.accept_bid(1, &alice, 45 * USDC).expect("accept");
    world
        .cancel_listing(1, &mallory)
        .expect("stale listing closes");
}
