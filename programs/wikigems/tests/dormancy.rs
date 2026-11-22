//! Inactive players: `post_notice`, `cancel_notice`, `reclaim`, `admin_burn`.
//! The guarantees tested here are what the terms of service promise players.

mod common;

use common::*;
use solana_signer::Signer;

/// Alice owns gem 1 and has no USDC account. Bob bids 30 USDC, then the admin
/// posts a notice.
fn world_with_notice() -> World {
    let mut world = World::initialized();
    let (bob, admin) = (world.bob.insecure_clone(), world.admin.insecure_clone());
    world.mint(1, world.alice.pubkey()).unwrap();
    world.set_usdc(bob.pubkey(), 100 * USDC);
    world.place_bid(1, &bob, 30 * USDC).unwrap();
    world.post_notice(1, &admin).expect("notice");
    world
}

#[test]
fn a_reclaim_after_the_notice_period_pays_the_owner_everything() {
    let mut world = world_with_notice();
    let (alice, bob, admin) = (
        world.alice.pubkey(),
        world.bob.pubkey(),
        world.admin.insecure_clone(),
    );
    world.warp(30 * DAY);

    world.reclaim(1, &admin, alice, 30 * USDC).expect("reclaim");

    assert_eq!(world.asset(1).base.owner, bob);
    assert_eq!(world.usdc(alice), 30 * USDC, "no fee on reclaims");
    assert_eq!(world.token_balance(&world.treasury()), 0);
    assert_eq!(
        world.lamports(&alice),
        0,
        "the owner's USDC account is sponsored"
    );
    for address in [
        notice_pda(gem_pda(1)),
        bid_pda(gem_pda(1)),
        vault_pda(gem_pda(1)),
    ] {
        assert!(!world.exists(&address));
    }
}

#[test]
fn no_reclaim_before_thirty_days() {
    let mut world = world_with_notice();
    let (alice, admin) = (world.alice.pubkey(), world.admin.insecure_clone());
    world.warp(30 * DAY - 1);
    assert_fails_with(
        world.reclaim(1, &admin, alice, 30 * USDC),
        "NoticePeriodActive",
    );
    assert_eq!(world.asset(1).base.owner, alice);
}

#[test]
fn no_reclaim_without_a_notice() {
    let mut world = World::initialized();
    let (bob, admin) = (world.bob.insecure_clone(), world.admin.insecure_clone());
    let alice = world.alice.pubkey();
    world.mint(1, alice).unwrap();
    world.set_usdc(bob.pubkey(), 100 * USDC);
    world.place_bid(1, &bob, 30 * USDC).unwrap();
    world.warp(365 * DAY);

    assert!(world.reclaim(1, &admin, alice, 30 * USDC).is_err());
    assert!(world
        .send(
            &[world.admin_burn_ix(admin.pubkey(), gem_pda(1))],
            &[&admin]
        )
        .is_err());
    assert_eq!(world.asset(1).base.owner, alice);
}

#[test]
fn the_owner_cancels_with_one_signature() {
    let mut world = world_with_notice();
    let (alice, admin) = (world.alice.insecure_clone(), world.admin.insecure_clone());
    world.cancel_notice(1, &alice).expect("I'm still here");
    world.warp(60 * DAY);
    assert!(world.reclaim(1, &admin, alice.pubkey(), 30 * USDC).is_err());
    assert_eq!(world.asset(1).base.owner, alice.pubkey());
    assert_eq!(
        world.lamports(&alice.pubkey()),
        0,
        "cancelling costs the owner nothing"
    );
}

#[test]
fn strangers_cannot_cancel_a_live_notice() {
    let mut world = world_with_notice();
    let mallory = world.mallory.insecure_clone();
    assert_fails_with(world.cancel_notice(1, &mallory), "NotAllowed");
}

#[test]
fn a_notice_is_void_once_the_card_changes_hands() {
    let mut world = world_with_notice();
    let (alice, carol, admin, mallory) = (
        world.alice.insecure_clone(),
        world.carol.pubkey(),
        world.admin.insecure_clone(),
        world.mallory.insecure_clone(),
    );
    let transfer = mpl_core::instructions::TransferV1Builder::new()
        .asset(gem_pda(1))
        .collection(Some(collection_pda()))
        .payer(world.sponsor.pubkey())
        .authority(Some(alice.pubkey()))
        .new_owner(carol)
        .instruction();
    world.send(&[transfer], &[&alice]).unwrap();
    world.warp(30 * DAY);

    assert_fails_with(
        world.reclaim(1, &admin, alice.pubkey(), 30 * USDC),
        "StaleNotice",
    );
    assert_eq!(world.asset(1).base.owner, carol);
    world
        .cancel_notice(1, &mallory)
        .expect("anyone closes a stale notice");
}

#[test]
fn a_fresh_bid_must_stand_for_a_week_before_a_reclaim() {
    let mut world = world_with_notice();
    let (alice, admin, carol) = (
        world.alice.pubkey(),
        world.admin.insecure_clone(),
        world.carol.insecure_clone(),
    );
    world.warp(30 * DAY);
    world.set_usdc(carol.pubkey(), 100 * USDC);
    world.place_bid(1, &carol, 31 * USDC).unwrap();

    assert_fails_with(world.reclaim(1, &admin, alice, 31 * USDC), "BidTooRecent");
    world.warp(7 * DAY);
    world.reclaim(1, &admin, alice, 31 * USDC).expect("reclaim");
    assert_eq!(world.usdc(alice), 31 * USDC);
}

#[test]
fn a_reclaim_uses_the_bid_the_admin_saw() {
    let mut world = world_with_notice();
    let (alice, admin) = (world.alice.pubkey(), world.admin.insecure_clone());
    world.warp(30 * DAY);
    assert_fails_with(
        world.reclaim(1, &admin, alice, 29 * USDC),
        "UnexpectedAmount",
    );
}

#[test]
fn only_the_admin_posts_notices_and_reclaims() {
    let mut world = world_with_notice();
    let (alice, mallory) = (world.alice.pubkey(), world.mallory.insecure_clone());
    world.mint(2, alice).unwrap();
    assert_fails_with(world.post_notice(2, &mallory), "ConstraintHasOne");
    world.warp(30 * DAY);
    assert_fails_with(
        world.reclaim(1, &mallory, alice, 30 * USDC),
        "ConstraintHasOne",
    );
}

#[test]
fn the_payout_goes_to_the_owner_named_in_the_notice() {
    let mut world = world_with_notice();
    let (admin, mallory) = (world.admin.insecure_clone(), world.mallory.pubkey());
    world.warp(30 * DAY);
    assert_fails_with(
        world.reclaim(1, &admin, mallory, 30 * USDC),
        "ConstraintAddress",
    );
}

#[test]
fn burning_requires_an_elapsed_notice() {
    let mut world = world_with_notice();
    let (admin, mallory) = (world.admin.insecure_clone(), world.mallory.insecure_clone());
    let burn = world.admin_burn_ix(admin.pubkey(), gem_pda(1));
    assert_fails_with(
        world.send(std::slice::from_ref(&burn), &[&admin]),
        "NoticePeriodActive",
    );

    world.warp(30 * DAY);
    let forged = world.admin_burn_ix(mallory.pubkey(), gem_pda(1));
    assert_fails_with(world.send(&[forged], &[&mallory]), "ConstraintHasOne");
    world.send(&[burn], &[&admin]).expect("burn");

    let after = world
        .svm
        .get_account(&gem_pda(1))
        .map(|a| a.data)
        .unwrap_or_default();
    assert!(mpl_core::Asset::from_bytes(&after).is_err());
    assert!(!world.exists(&notice_pda(gem_pda(1))));
    // A burned gem's ID is retired for good.
    assert!(world.mint(1, world.bob.pubkey()).is_err());
}

/// Escrowed USDC never gets stuck, even if its card no longer exists.
#[test]
fn a_bid_on_a_burned_card_can_still_be_cancelled() {
    let mut world = world_with_notice();
    let (admin, bob) = (world.admin.insecure_clone(), world.bob.insecure_clone());
    world.warp(30 * DAY);
    world
        .send(
            &[world.admin_burn_ix(admin.pubkey(), gem_pda(1))],
            &[&admin],
        )
        .unwrap();
    world.cancel_bid(1, &bob).expect("refund");
    assert_eq!(world.usdc(bob.pubkey()), 100 * USDC);
}

/// The admin's delegate powers only reach WikiGems cards.
#[test]
fn notices_are_limited_to_the_wikigems_collection() {
    let mut world = World::initialized();
    let (alice, admin) = (world.alice.insecure_clone(), world.admin.insecure_clone());
    let foreign = solana_keypair::Keypair::new();
    let create = mpl_core::instructions::CreateV2Builder::new()
        .asset(foreign.pubkey())
        .payer(world.sponsor.pubkey())
        .owner(Some(alice.pubkey()))
        .name("Other".into())
        .uri("https://example.com".into())
        .instruction();
    world.send(&[create], &[&foreign]).expect("foreign asset");

    let accounts = wikigems_program::accounts::PostNotice {
        config: config_pda(),
        admin: admin.pubkey(),
        collection: collection_pda(),
        asset: foreign.pubkey(),
        notice: notice_pda(foreign.pubkey()),
        payer: world.sponsor.pubkey(),
        system_program: anchor_lang::system_program::ID,
    };
    let notice = ix(accounts, wikigems_program::instruction::PostNotice {});
    assert_fails_with(world.send(&[notice], &[&admin]), "InvalidAsset");
}
