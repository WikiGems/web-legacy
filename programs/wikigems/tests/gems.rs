//! End-to-end behaviour of the WikiGems program against the real Metaplex Core
//! program. Requires `bun run build:program` and `bun scripts/fetch-test-programs.ts`.

mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use mpl_core::{
    instructions::{BurnV1Builder, TransferV1Builder},
    types::UpdateAuthority,
    AuthorityType,
};
use solana_account::Account;
use solana_signer::Signer;
use wikigems_program::{accounts, instruction};

// ---------------------------------------------------------------- initialize

#[test]
fn initialize_creates_collection_with_permanent_delegates() {
    let world = World::initialized();

    let config = world.config();
    assert_eq!(config.admin, world.admin.pubkey());
    assert_eq!(config.mint_authority, world.mint_authority.pubkey());
    assert_eq!(config.collection, collection_pda());
    assert_eq!(config.pending_admin, None);
    assert_eq!(config.usdc_mint, world.usdc_mint);
    assert_eq!(config.treasury, world.treasury());
    assert_eq!(config.fee_bps, FEE_BPS);

    let account = world.account(&collection_pda()).expect("collection exists");
    assert_eq!(account.owner, mpl_core::ID);
    let collection = mpl_core::Collection::from_bytes(&account.data).unwrap();
    assert_eq!(collection.base.update_authority, authority_pda());

    let plugins = &collection.plugin_list;
    for authority in [
        plugins
            .permanent_transfer_delegate
            .as_ref()
            .expect("transfer delegate")
            .base
            .authority,
        plugins
            .permanent_burn_delegate
            .as_ref()
            .expect("burn delegate")
            .base
            .authority,
    ] {
        assert_eq!(authority.authority_type, AuthorityType::Address);
        assert_eq!(authority.address, Some(authority_pda()));
    }
    // Nothing else may hold power over players' cards.
    assert!(plugins.permanent_freeze_delegate.is_none());
}

#[test]
fn initialize_requires_the_upgrade_authority() {
    let mut world = World::deployed();
    let mallory = world.mallory.insecure_clone();
    assert_fails_with(world.initialize(&mallory), "ConstraintRaw");
    assert!(world.account(&config_pda()).is_none());
}

#[test]
fn initialize_runs_only_once() {
    let mut world = World::initialized();
    let deployer = world.deployer.insecure_clone();
    assert!(world.initialize(&deployer).is_err());
}

// ---------------------------------------------------------------- mint_gem

#[test]
fn mint_puts_the_gem_at_its_derived_address_without_the_owner_paying() {
    let mut world = World::initialized();
    let alice = world.alice.pubkey();
    let sponsor_before = world.lamports(&world.sponsor.pubkey());

    world.mint(42, alice).expect("mint");

    let asset = world.asset(42);
    assert_eq!(asset.base.owner, alice);
    assert_eq!(
        asset.base.update_authority,
        UpdateAuthority::Collection(collection_pda())
    );
    assert_eq!(asset.base.name, "#42");
    assert_eq!(asset.base.uri, "https://wikigems.example/g/42");
    assert_eq!(world.lamports(&alice), 0, "players never need SOL");

    let collection =
        mpl_core::Collection::from_bytes(&world.account(&collection_pda()).unwrap().data).unwrap();
    assert_eq!(collection.base.num_minted, 1);

    // Cost report for the sponsor budget. Core parks its protocol fee in the
    // asset account on top of the rent-exempt minimum; the fee stays behind
    // (in the tombstone) even when the asset is burned.
    let spent = sponsor_before - world.lamports(&world.sponsor.pubkey());
    let held = world.lamports(&gem_pda(42));
    let data_len = world.account(&gem_pda(42)).unwrap().data.len();
    let rent = world.svm.minimum_balance_for_rent_exemption(data_len);
    println!(
        "mint cost: {spent} lamports = rent {rent} ({data_len} bytes) + Core fee {} + tx fees {}",
        held - rent,
        spent - held
    );
    assert_eq!(
        held - rent,
        1_500_000,
        "Core protocol fee changed; update the sponsor budget"
    );
}

#[test]
fn each_gem_can_be_minted_only_once() {
    let mut world = World::initialized();
    let (alice, bob) = (world.alice.pubkey(), world.bob.pubkey());
    world.mint(7, alice).expect("first mint");

    assert_fails_with(world.mint(7, bob), "GemAlreadyMinted");
    assert_eq!(world.asset(7).base.owner, alice);
    // Other gem IDs are unaffected.
    world.mint(8, bob).expect("different gem");
}

#[test]
fn mint_requires_the_mint_authority() {
    let mut world = World::initialized();
    let mallory = world.mallory.insecure_clone();
    let instruction = world.mint_ix(1, mallory.pubkey(), mallory.pubkey(), "#1", "u");
    assert_fails_with(world.send(&[instruction], &[&mallory]), "ConstraintHasOne");
    assert!(world.account(&gem_pda(1)).is_none());
}

#[test]
fn mint_rejects_oversized_metadata() {
    let mut world = World::initialized();
    let (alice, mint_authority) = (world.alice.pubkey(), world.mint_authority.insecure_clone());

    let long_name = world.mint_ix(1, alice, mint_authority.pubkey(), &"n".repeat(33), "u");
    assert_fails_with(world.send(&[long_name], &[&mint_authority]), "NameTooLong");

    let long_uri = world.mint_ix(1, alice, mint_authority.pubkey(), "#1", &"u".repeat(97));
    assert_fails_with(world.send(&[long_uri], &[&mint_authority]), "UriTooLong");
}

/// Anyone can send lamports to a not-yet-minted gem address. That must not
/// block the mint (a cheap way to grief specific articles).
#[test]
fn prefunded_gem_address_still_mints() {
    let mut world = World::initialized();
    let gem = gem_pda(99);
    let alice = world.alice.pubkey();
    world
        .svm
        .set_account(
            gem,
            Account {
                lamports: 1_000_000,
                ..Account::default()
            },
        )
        .unwrap();

    let result = world.mint(99, alice);
    println!(
        "prefunded mint result: {:?}",
        result.as_ref().map(|_| ()).map_err(|e| &e.err)
    );
    result.expect("mint should succeed despite prefunded address");
    assert_eq!(world.asset(99).base.owner, alice);
}

// ---------------------------------------------------------------- owner rights

#[test]
fn owners_can_transfer_their_own_gems() {
    let mut world = World::initialized();
    let (alice, bob) = (world.alice.insecure_clone(), world.bob.pubkey());
    world.mint(5, alice.pubkey()).unwrap();

    let transfer = TransferV1Builder::new()
        .asset(gem_pda(5))
        .collection(Some(collection_pda()))
        .payer(world.sponsor.pubkey())
        .authority(Some(alice.pubkey()))
        .new_owner(bob)
        .instruction();
    world.send(&[transfer], &[&alice]).expect("owner transfer");
    assert_eq!(world.asset(5).base.owner, bob);
}

#[test]
fn strangers_cannot_transfer_gems() {
    let mut world = World::initialized();
    let mallory = world.mallory.insecure_clone();
    world.mint(5, world.alice.pubkey()).unwrap();

    let transfer = TransferV1Builder::new()
        .asset(gem_pda(5))
        .collection(Some(collection_pda()))
        .payer(world.sponsor.pubkey())
        .authority(Some(mallory.pubkey()))
        .new_owner(mallory.pubkey())
        .instruction();
    assert!(world.send(&[transfer], &[&mallory]).is_err());
    assert_eq!(world.asset(5).base.owner, world.alice.pubkey());
}

/// Documents current behaviour: a player can burn their own card and the
/// rent goes to whoever pays the burn transaction. With the sponsor as fee
/// payer the rent comes back to the sponsor, not the player.
#[test]
fn owner_burn_returns_rent_to_the_payer() {
    let mut world = World::initialized();
    let alice = world.alice.insecure_clone();
    world.mint(6, alice.pubkey()).unwrap();
    let rent = world.lamports(&gem_pda(6));
    let sponsor_before = world.lamports(&world.sponsor.pubkey());

    let burn = BurnV1Builder::new()
        .asset(gem_pda(6))
        .collection(Some(collection_pda()))
        .payer(world.sponsor.pubkey())
        .authority(Some(alice.pubkey()))
        .instruction();
    world.send(&[burn], &[&alice]).expect("owner burn");

    let refunded = world.lamports(&world.sponsor.pubkey()) as i128 - sponsor_before as i128;
    println!("owner burn: asset rent {rent}, sponsor balance change {refunded}");
    assert_eq!(world.lamports(&alice.pubkey()), 0);
}

// ---------------------------------------------------------------- config

#[test]
fn admin_handover_takes_two_steps() {
    let mut world = World::initialized();
    let (admin, bob, mallory) = (
        world.admin.insecure_clone(),
        world.bob.insecure_clone(),
        world.mallory.insecure_clone(),
    );

    let propose = ix(
        accounts::AdminOnly {
            config: config_pda(),
            admin: admin.pubkey(),
        },
        instruction::ProposeAdmin {
            new_admin: bob.pubkey(),
        },
    );
    world.send(&[propose], &[&admin]).expect("propose");
    assert_eq!(world.config().admin, admin.pubkey(), "not yet changed");

    let accept = |signer: Pubkey| {
        ix(
            accounts::AcceptAdmin {
                config: config_pda(),
                new_admin: signer,
            },
            instruction::AcceptAdmin {},
        )
    };
    assert_fails_with(
        world.send(&[accept(mallory.pubkey())], &[&mallory]),
        "NotPendingAdmin",
    );
    world
        .send(&[accept(bob.pubkey())], &[&bob])
        .expect("accept");

    let config = world.config();
    assert_eq!(config.admin, bob.pubkey());
    assert_eq!(config.pending_admin, None);

    // The previous admin has lost its powers.
    world.mint(20, world.alice.pubkey()).unwrap();
    assert_fails_with(world.post_notice(20, &admin), "ConstraintHasOne");
}

#[test]
fn admin_rotates_the_mint_authority() {
    let mut world = World::initialized();
    let admin = world.admin.insecure_clone();
    let old_mint_authority = world.mint_authority.insecure_clone();
    let new_mint_authority = solana_keypair::Keypair::new();

    let rotate = ix(
        accounts::AdminOnly {
            config: config_pda(),
            admin: admin.pubkey(),
        },
        instruction::SetMintAuthority {
            mint_authority: new_mint_authority.pubkey(),
        },
    );
    world.send(&[rotate], &[&admin]).expect("rotate");

    let alice = world.alice.pubkey();
    let old = world.mint_ix(30, alice, old_mint_authority.pubkey(), "#30", "u");
    assert_fails_with(
        world.send(&[old], &[&old_mint_authority]),
        "ConstraintHasOne",
    );
    let new = world.mint_ix(30, alice, new_mint_authority.pubkey(), "#30", "u");
    world
        .send(&[new], &[&new_mint_authority])
        .expect("new key mints");
}

#[test]
fn non_admins_cannot_change_config() {
    let mut world = World::initialized();
    let mallory = world.mallory.insecure_clone();
    for data in [
        ix(
            accounts::AdminOnly {
                config: config_pda(),
                admin: mallory.pubkey(),
            },
            instruction::SetMintAuthority {
                mint_authority: mallory.pubkey(),
            },
        ),
        ix(
            accounts::AdminOnly {
                config: config_pda(),
                admin: mallory.pubkey(),
            },
            instruction::ProposeAdmin {
                new_admin: mallory.pubkey(),
            },
        ),
    ] {
        assert_fails_with(world.send(&[data], &[&mallory]), "ConstraintHasOne");
    }
    assert_eq!(world.config().mint_authority, world.mint_authority.pubkey());
}
