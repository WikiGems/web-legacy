//! Escrowless listings: `list`, `update_listing`, `cancel_listing`, `buy`.

mod common;

use common::*;
use solana_signer::Signer;

/// Alice owns gem 1; Bob holds 100 USDC.
fn world_with_listing(price: u64) -> World {
    let mut world = World::initialized();
    let (alice, bob) = (world.alice.insecure_clone(), world.bob.pubkey());
    world.mint(1, alice.pubkey()).unwrap();
    world.set_usdc(bob, 100 * USDC);
    world.list(1, &alice, price).expect("list");
    world
}

#[test]
fn buying_pays_the_seller_minus_the_fee_and_moves_the_card() {
    let mut world = world_with_listing(10 * USDC);
    let (alice, bob) = (world.alice.pubkey(), world.bob.insecure_clone());
    assert_eq!(
        world.asset(1).base.owner,
        alice,
        "listing keeps the card with the seller"
    );
    assert!(
        world.svm.get_account(&world.ata(alice)).is_none(),
        "seller has no USDC account yet"
    );

    world.buy(1, &bob, 10 * USDC).expect("buy");

    assert_eq!(world.asset(1).base.owner, bob.pubkey());
    let fee = 10 * USDC * u64::from(FEE_BPS) / 10_000;
    assert_eq!(
        world.usdc(alice),
        10 * USDC - fee,
        "seller's account is created and paid"
    );
    assert_eq!(world.token_balance(&world.treasury()), fee);
    assert_eq!(world.usdc(bob.pubkey()), 90 * USDC);
    assert!(!world.exists(&listing_pda(gem_pda(1))), "listing is closed");
    assert_eq!(world.lamports(&alice), 0, "players never need SOL");
    assert_eq!(world.lamports(&bob.pubkey()), 0);
}

#[test]
fn buyer_is_protected_from_a_price_change() {
    let mut world = world_with_listing(10 * USDC);
    let (alice, bob) = (world.alice.insecure_clone(), world.bob.insecure_clone());
    world.update_listing(1, &alice, 50 * USDC).expect("reprice");

    assert_fails_with(world.buy(1, &bob, 10 * USDC), "UnexpectedAmount");
    assert_eq!(world.usdc(bob.pubkey()), 100 * USDC);
    world.buy(1, &bob, 50 * USDC).expect("buy at the new price");
}

#[test]
fn buyer_needs_enough_usdc() {
    let mut world = world_with_listing(500 * USDC);
    let bob = world.bob.insecure_clone();
    assert!(world.buy(1, &bob, 500 * USDC).is_err());
    assert_eq!(world.asset(1).base.owner, world.alice.pubkey());
}

#[test]
fn only_the_owner_can_list() {
    let mut world = World::initialized();
    let mallory = world.mallory.insecure_clone();
    world.mint(1, world.alice.pubkey()).unwrap();
    assert_fails_with(world.list(1, &mallory, USDC), "NotOwner");

    let alice = world.alice.insecure_clone();
    assert_fails_with(world.list(1, &alice, 0), "ZeroAmount");
}

#[test]
fn only_the_seller_can_reprice() {
    let mut world = world_with_listing(10 * USDC);
    let mallory = world.mallory.insecure_clone();
    assert_fails_with(world.update_listing(1, &mallory, 1), "ConstraintHasOne");
    assert_eq!(world.listing(gem_pda(1)).price, 10 * USDC);
}

#[test]
fn the_seller_cancels_and_a_stranger_cannot() {
    let mut world = world_with_listing(10 * USDC);
    let (alice, mallory) = (world.alice.insecure_clone(), world.mallory.insecure_clone());
    assert_fails_with(world.cancel_listing(1, &mallory), "NotAllowed");

    let sponsor_before = world.lamports(&world.sponsor.pubkey());
    world.cancel_listing(1, &alice).expect("cancel");
    assert!(!world.exists(&listing_pda(gem_pda(1))));
    assert!(
        world.lamports(&world.sponsor.pubkey()) > sponsor_before,
        "rent returns to the sponsor"
    );
}

/// The seller still holds the card, so they can move it while it is listed.
/// The listing then goes stale: nobody can buy through it, and anyone can
/// close it.
#[test]
fn a_listing_goes_stale_when_the_seller_moves_the_card() {
    let mut world = world_with_listing(10 * USDC);
    let (alice, carol) = (world.alice.insecure_clone(), world.carol.pubkey());
    let (bob, mallory) = (world.bob.insecure_clone(), world.mallory.insecure_clone());
    let transfer = mpl_core::instructions::TransferV1Builder::new()
        .asset(gem_pda(1))
        .collection(Some(collection_pda()))
        .payer(world.sponsor.pubkey())
        .authority(Some(alice.pubkey()))
        .new_owner(carol)
        .instruction();
    world.send(&[transfer], &[&alice]).expect("owner transfer");

    assert_fails_with(world.buy(1, &bob, 10 * USDC), "StaleListing");
    assert_eq!(world.asset(1).base.owner, carol, "Carol keeps the card");
    assert_eq!(world.usdc(bob.pubkey()), 100 * USDC);

    world
        .cancel_listing(1, &mallory)
        .expect("anyone closes a stale listing");
}

#[test]
fn sellers_cannot_buy_their_own_card() {
    let mut world = world_with_listing(10 * USDC);
    let alice = world.alice.insecure_clone();
    world.set_usdc(alice.pubkey(), 100 * USDC);
    assert_fails_with(world.buy(1, &alice, 10 * USDC), "OwnCard");
}

#[test]
fn a_listing_keeps_the_fee_it_was_created_with() {
    let mut world = world_with_listing(10 * USDC);
    let (admin, bob) = (world.admin.insecure_clone(), world.bob.insecure_clone());
    let treasury = world.treasury();
    world
        .set_market_config(&admin, treasury, 1_000)
        .expect("raise fee");

    world.buy(1, &bob, 10 * USDC).unwrap();
    let fee = 10 * USDC * u64::from(FEE_BPS) / 10_000;
    assert_eq!(world.token_balance(&world.treasury()), fee);
}

#[test]
fn the_fee_is_capped_and_admin_only() {
    let mut world = World::initialized();
    let (admin, mallory) = (world.admin.insecure_clone(), world.mallory.insecure_clone());
    let treasury = world.treasury();
    assert_fails_with(
        world.set_market_config(&admin, treasury, 1_001),
        "FeeTooHigh",
    );
    assert_fails_with(
        world.set_market_config(&mallory, treasury, 0),
        "ConstraintHasOne",
    );

    // The treasury must be a USDC account.
    let mallory_wallet = world.mallory.pubkey();
    let other_mint_account = world.set_usdc(mallory_wallet, 0);
    let mut account = world.svm.get_account(&other_mint_account).unwrap();
    account.data[..32].copy_from_slice(solana_keypair::Keypair::new().pubkey().as_ref());
    world.svm.set_account(other_mint_account, account).unwrap();
    assert!(world
        .set_market_config(&admin, other_mint_account, 0)
        .is_err());

    world
        .set_market_config(&admin, treasury, 0)
        .expect("zero fee");
    assert_eq!(world.config().fee_bps, 0);
}

#[test]
fn foreign_core_assets_cannot_be_listed() {
    let mut world = World::initialized();
    let alice = world.alice.insecure_clone();
    let foreign = solana_keypair::Keypair::new();
    let create = mpl_core::instructions::CreateV2Builder::new()
        .asset(foreign.pubkey())
        .payer(world.sponsor.pubkey())
        .owner(Some(alice.pubkey()))
        .name("Other".into())
        .uri("https://example.com".into())
        .instruction();
    world.send(&[create], &[&foreign]).expect("foreign asset");

    let mut list = world.list_ix(0, alice.pubkey(), USDC);
    list.accounts[2].pubkey = foreign.pubkey();
    list.accounts[3].pubkey = listing_pda(foreign.pubkey());
    assert_fails_with(world.send(&[list], &[&alice]), "InvalidAsset");
}
