//! LiteSVM harness: loads the compiled WikiGems program and the real Metaplex
//! Core binary (fetched by `bun scripts/fetch-test-programs.ts`).
#![allow(dead_code)]
// `TransactionResult` is LiteSVM's own type; boxing it would only add noise to tests.
#![allow(clippy::result_large_err)]

use anchor_lang::{prelude::Pubkey, InstructionData, ToAccountMetas};
use anchor_spl::{associated_token::get_associated_token_address, token::spl_token};
use litesvm::{types::TransactionResult, LiteSVM};
use solana_account::Account;
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_message::{Instruction, Message};
use solana_program_option::COption;
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::Transaction;
use wikigems_program::{
    accounts, instruction, InitializeArgs, AUTHORITY_SEED, BID_SEED, BID_VAULT_SEED,
    COLLECTION_SEED, CONFIG_SEED, GEM_SEED, LISTING_SEED, NOTICE_SEED,
};

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const UPGRADEABLE_LOADER: Pubkey = anchor_lang::solana_program::bpf_loader_upgradeable::ID;

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &wikigems_program::ID).0
}
pub fn config_pda() -> Pubkey {
    pda(&[CONFIG_SEED])
}
pub fn authority_pda() -> Pubkey {
    pda(&[AUTHORITY_SEED])
}
pub fn collection_pda() -> Pubkey {
    pda(&[COLLECTION_SEED])
}
pub fn gem_pda(gem_id: u64) -> Pubkey {
    pda(&[GEM_SEED, &gem_id.to_le_bytes()])
}
pub fn listing_pda(asset: Pubkey) -> Pubkey {
    pda(&[LISTING_SEED, asset.as_ref()])
}
pub fn bid_pda(asset: Pubkey) -> Pubkey {
    pda(&[BID_SEED, asset.as_ref()])
}
pub fn vault_pda(asset: Pubkey) -> Pubkey {
    pda(&[BID_VAULT_SEED, asset.as_ref()])
}
pub fn notice_pda(asset: Pubkey) -> Pubkey {
    pda(&[NOTICE_SEED, asset.as_ref()])
}

/// One USDC in minor units.
pub const USDC: u64 = 1_000_000;
pub const DAY: i64 = 24 * 60 * 60;
/// Marketplace fee used by the test deployment: 5%.
pub const FEE_BPS: u16 = 500;

pub fn ix(accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: wikigems_program::ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

pub struct World {
    pub svm: LiteSVM,
    pub deployer: Keypair,
    pub admin: Keypair,
    pub mint_authority: Keypair,
    /// Fee payer for everything: the app's sponsor wallet.
    pub sponsor: Keypair,
    pub alice: Keypair,
    pub bob: Keypair,
    pub carol: Keypair,
    pub mallory: Keypair,
    pub usdc_mint: Pubkey,
    /// Wallet whose USDC associated token account collects fees.
    pub treasury_owner: Keypair,
}

fn fixture(path: &str) -> Vec<u8> {
    let full = format!("{}/{}", env!("CARGO_MANIFEST_DIR"), path);
    std::fs::read(&full).unwrap_or_else(|_| {
        panic!(
            "missing {full}: run `bun run build:program` and `bun scripts/fetch-test-programs.ts`"
        )
    })
}

impl World {
    /// Programs loaded, nothing initialized.
    pub fn deployed() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program(
            wikigems_program::ID,
            &fixture("../../target/deploy/wikigems_program.so"),
        )
        .unwrap();
        svm.add_program(mpl_core::ID, &fixture("tests/fixtures/mpl_core.so"))
            .unwrap();

        let world = Self {
            svm,
            deployer: Keypair::new(),
            admin: Keypair::new(),
            mint_authority: Keypair::new(),
            sponsor: Keypair::new(),
            alice: Keypair::new(),
            bob: Keypair::new(),
            carol: Keypair::new(),
            mallory: Keypair::new(),
            usdc_mint: Pubkey::new_unique(),
            treasury_owner: Keypair::new(),
        };
        let mut world = world;
        world.create_usdc_mint();
        let treasury_owner = world.treasury_owner.pubkey();
        world.set_usdc(treasury_owner, 0);
        // Only the sponsor and the attacker hold SOL. Players, the admin and the
        // mint authority have zero lamports, as they would in production.
        world
            .svm
            .airdrop(&world.sponsor.pubkey(), 100 * LAMPORTS_PER_SOL)
            .unwrap();
        world
            .svm
            .airdrop(&world.mallory.pubkey(), 10 * LAMPORTS_PER_SOL)
            .unwrap();
        world.set_upgrade_authority(world.deployer.pubkey());
        world
    }

    /// Programs loaded and `initialize` executed.
    pub fn initialized() -> Self {
        let mut world = Self::deployed();
        let deployer = world.deployer.insecure_clone();
        world.initialize(&deployer).expect("initialize");
        world
    }

    /// LiteSVM deploys with no upgrade authority; patch the ProgramData header
    /// (u32 tag, u64 slot, Option<Pubkey>) the way a real deploy would set it.
    fn set_upgrade_authority(&mut self, authority: Pubkey) {
        let program_data = program_data_address();
        let mut account = self.svm.get_account(&program_data).unwrap();
        account.data[12] = 1;
        account.data[13..45].copy_from_slice(authority.as_ref());
        self.svm.set_account(program_data, account).unwrap();
    }

    pub fn send(
        &mut self,
        instructions: &[Instruction],
        signers: &[&Keypair],
    ) -> TransactionResult {
        // A fresh blockhash per call lets tests resend identical instructions.
        self.svm.expire_blockhash();
        let mut all_signers = vec![&self.sponsor];
        all_signers.extend_from_slice(signers);
        let message = Message::new(instructions, Some(&self.sponsor.pubkey()));
        let tx = Transaction::new(&all_signers, message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    pub fn initialize(&mut self, deployer: &Keypair) -> TransactionResult {
        let accounts = accounts::Initialize {
            config: config_pda(),
            authority: authority_pda(),
            collection: collection_pda(),
            payer: self.sponsor.pubkey(),
            usdc_mint: self.usdc_mint,
            treasury: self.treasury(),
            deployer: deployer.pubkey(),
            program: wikigems_program::ID,
            program_data: program_data_address(),
            mpl_core_program: mpl_core::ID,
            system_program: anchor_lang::system_program::ID,
        };
        let args = InitializeArgs {
            admin: self.admin.pubkey(),
            mint_authority: self.mint_authority.pubkey(),
            collection_name: "WikiGems".into(),
            collection_uri: "https://wikigems.example/collection.json".into(),
            fee_bps: FEE_BPS,
        };
        let instruction = ix(accounts, instruction::Initialize { args });
        self.send(&[instruction], &[deployer])
    }

    pub fn mint_ix(
        &self,
        gem_id: u64,
        owner: Pubkey,
        mint_authority: Pubkey,
        name: &str,
        uri: &str,
    ) -> Instruction {
        let accounts = accounts::MintGem {
            config: config_pda(),
            mint_authority,
            payer: self.sponsor.pubkey(),
            authority: authority_pda(),
            collection: collection_pda(),
            asset: gem_pda(gem_id),
            owner,
            mpl_core_program: mpl_core::ID,
            system_program: anchor_lang::system_program::ID,
        };
        ix(
            accounts,
            instruction::MintGem {
                gem_id,
                name: name.into(),
                uri: uri.into(),
            },
        )
    }

    pub fn mint(&mut self, gem_id: u64, owner: Pubkey) -> TransactionResult {
        let instruction = self.mint_ix(
            gem_id,
            owner,
            self.mint_authority.pubkey(),
            &format!("#{gem_id}"),
            &format!("https://wikigems.example/g/{gem_id}"),
        );
        let mint_authority = self.mint_authority.insecure_clone();
        self.send(&[instruction], &[&mint_authority])
    }

    pub fn account(&self, address: &Pubkey) -> Option<Account> {
        self.svm
            .get_account(address)
            .filter(|account| account.lamports > 0)
    }

    pub fn lamports(&self, address: &Pubkey) -> u64 {
        self.account(address).map_or(0, |account| account.lamports)
    }

    pub fn asset(&self, gem_id: u64) -> mpl_core::Asset {
        let account = self.account(&gem_pda(gem_id)).expect("asset exists");
        *mpl_core::Asset::from_bytes(&account.data).expect("valid Core asset")
    }

    pub fn config(&self) -> wikigems_program::Config {
        use anchor_lang::AccountDeserialize;
        let account = self.account(&config_pda()).expect("config exists");
        wikigems_program::Config::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
}

pub fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(&[wikigems_program::ID.as_ref()], &UPGRADEABLE_LOADER).0
}

/// Asserts a transaction failed and that its logs mention `needle`.
pub fn assert_fails_with(result: TransactionResult, needle: &str) {
    match result {
        Ok(meta) => panic!(
            "expected failure containing {needle:?}, got success:\n{}",
            meta.logs.join("\n")
        ),
        Err(failure) => {
            let logs = failure.meta.logs.join("\n");
            assert!(
                logs.contains(needle) || format!("{:?}", failure.err).contains(needle),
                "expected {needle:?} in failure {:?}\n{logs}",
                failure.err
            );
        }
    }
}

// ------------------------------------------------------------------ USDC and time

impl World {
    /// A 6-decimal mint standing in for USDC. Tests write balances directly.
    fn create_usdc_mint(&mut self) {
        let mint = spl_token::state::Mint {
            mint_authority: COption::Some(Pubkey::new_unique()),
            supply: 0,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        let mut data = vec![0; spl_token::state::Mint::LEN];
        mint.pack_into_slice(&mut data);
        self.write_token_program_account(self.usdc_mint, data);
    }

    fn write_token_program_account(&mut self, address: Pubkey, data: Vec<u8>) {
        let lamports = self.svm.minimum_balance_for_rent_exemption(data.len());
        self.svm
            .set_account(
                address,
                Account {
                    lamports,
                    data,
                    owner: spl_token::ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .unwrap();
    }

    pub fn ata(&self, owner: Pubkey) -> Pubkey {
        get_associated_token_address(&owner, &self.usdc_mint)
    }

    pub fn treasury(&self) -> Pubkey {
        self.ata(self.treasury_owner.pubkey())
    }

    /// Gives `owner` a USDC associated token account holding `amount`.
    pub fn set_usdc(&mut self, owner: Pubkey, amount: u64) -> Pubkey {
        let address = self.ata(owner);
        let account = spl_token::state::Account {
            mint: self.usdc_mint,
            owner,
            amount,
            delegate: COption::None,
            state: spl_token::state::AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        };
        let mut data = vec![0; spl_token::state::Account::LEN];
        account.pack_into_slice(&mut data);
        self.write_token_program_account(address, data);
        address
    }

    /// USDC balance of a token account, 0 if it does not exist.
    pub fn token_balance(&self, token_account: &Pubkey) -> u64 {
        self.account(token_account).map_or(0, |account| {
            spl_token::state::Account::unpack(&account.data)
                .unwrap()
                .amount
        })
    }

    /// USDC balance of `owner`'s associated token account.
    pub fn usdc(&self, owner: Pubkey) -> u64 {
        self.token_balance(&self.ata(owner))
    }

    pub fn warp(&mut self, seconds: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp += seconds;
        clock.slot += 1;
        self.svm.set_sysvar(&clock);
    }

    pub fn exists(&self, address: &Pubkey) -> bool {
        self.account(address).is_some()
    }

    pub fn listing(&self, asset: Pubkey) -> wikigems_program::Listing {
        self.decode(&listing_pda(asset))
    }

    pub fn bid(&self, asset: Pubkey) -> wikigems_program::Bid {
        self.decode(&bid_pda(asset))
    }

    fn decode<T: anchor_lang::AccountDeserialize>(&self, address: &Pubkey) -> T {
        let account = self.account(address).expect("account exists");
        T::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
}

// ------------------------------------------------------------------ marketplace

impl World {
    pub fn list_ix(&self, gem_id: u64, seller: Pubkey, price: u64) -> Instruction {
        let asset = gem_pda(gem_id);
        let accounts = accounts::List {
            config: config_pda(),
            collection: collection_pda(),
            asset,
            listing: listing_pda(asset),
            seller,
            payer: self.sponsor.pubkey(),
            system_program: anchor_lang::system_program::ID,
        };
        ix(accounts, instruction::List { price })
    }

    pub fn list(&mut self, gem_id: u64, seller: &Keypair, price: u64) -> TransactionResult {
        let instruction = self.list_ix(gem_id, seller.pubkey(), price);
        self.send(&[instruction], &[seller])
    }

    pub fn update_listing(
        &mut self,
        gem_id: u64,
        seller: &Keypair,
        price: u64,
    ) -> TransactionResult {
        let accounts = accounts::UpdateListing {
            listing: listing_pda(gem_pda(gem_id)),
            seller: seller.pubkey(),
        };
        self.send(
            &[ix(accounts, instruction::UpdateListing { price })],
            &[seller],
        )
    }

    pub fn cancel_listing(&mut self, gem_id: u64, closer: &Keypair) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let accounts = accounts::CancelListing {
            config: config_pda(),
            collection: collection_pda(),
            asset,
            listing: listing_pda(asset),
            closer: closer.pubkey(),
            rent_payer: self.sponsor.pubkey(),
        };
        self.send(&[ix(accounts, instruction::CancelListing {})], &[closer])
    }

    pub fn buy(&mut self, gem_id: u64, buyer: &Keypair, expected_price: u64) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let seller = self.listing(asset).seller;
        let accounts = accounts::Buy {
            config: config_pda(),
            collection: collection_pda(),
            asset,
            listing: listing_pda(asset),
            seller,
            seller_usdc: self.ata(seller),
            buyer: buyer.pubkey(),
            buyer_usdc: self.ata(buyer.pubkey()),
            treasury: self.treasury(),
            usdc_mint: self.usdc_mint,
            rent_payer: self.sponsor.pubkey(),
            payer: self.sponsor.pubkey(),
            authority: authority_pda(),
            mpl_core_program: mpl_core::ID,
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        };
        self.send(
            &[ix(accounts, instruction::Buy { expected_price })],
            &[buyer],
        )
    }

    pub fn set_market_config(
        &mut self,
        admin: &Keypair,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> TransactionResult {
        let accounts = accounts::SetMarketConfig {
            config: config_pda(),
            admin: admin.pubkey(),
            treasury,
        };
        self.send(
            &[ix(accounts, instruction::SetMarketConfig { fee_bps })],
            &[admin],
        )
    }

    // -------------------------------------------------------------- bids

    pub fn place_bid(&mut self, gem_id: u64, bidder: &Keypair, amount: u64) -> TransactionResult {
        let instruction = self.place_bid_ix(gem_id, bidder.pubkey(), amount);
        self.send(&[instruction], &[bidder])
    }

    /// Fills in the current bidder as the account to refund.
    pub fn place_bid_ix(&self, gem_id: u64, bidder: Pubkey, amount: u64) -> Instruction {
        let asset = gem_pda(gem_id);
        let previous = self.exists(&bid_pda(asset)).then(|| self.bid(asset).bidder);
        let accounts = accounts::PlaceBid {
            config: config_pda(),
            collection: collection_pda(),
            asset,
            bid: bid_pda(asset),
            vault: vault_pda(asset),
            bidder,
            bidder_usdc: self.ata(bidder),
            previous_bidder: previous,
            previous_bidder_usdc: previous.map(|previous| self.ata(previous)),
            usdc_mint: self.usdc_mint,
            payer: self.sponsor.pubkey(),
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        };
        ix(accounts, instruction::PlaceBid { amount })
    }

    pub fn cancel_bid(&mut self, gem_id: u64, bidder: &Keypair) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let accounts = accounts::CancelBid {
            bid: bid_pda(asset),
            vault: vault_pda(asset),
            bidder: bidder.pubkey(),
            bidder_usdc: self.ata(bidder.pubkey()),
            rent_payer: self.sponsor.pubkey(),
            token_program: spl_token::ID,
        };
        self.send(&[ix(accounts, instruction::CancelBid {})], &[bidder])
    }

    pub fn accept_bid(
        &mut self,
        gem_id: u64,
        seller: &Keypair,
        expected_amount: u64,
    ) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let bidder = self.bid(asset).bidder;
        let accounts = accounts::AcceptBid {
            config: config_pda(),
            collection: collection_pda(),
            asset,
            bid: bid_pda(asset),
            vault: vault_pda(asset),
            bidder,
            seller: seller.pubkey(),
            seller_usdc: self.ata(seller.pubkey()),
            treasury: self.treasury(),
            usdc_mint: self.usdc_mint,
            rent_payer: self.sponsor.pubkey(),
            payer: self.sponsor.pubkey(),
            authority: authority_pda(),
            mpl_core_program: mpl_core::ID,
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        };
        self.send(
            &[ix(accounts, instruction::AcceptBid { expected_amount })],
            &[seller],
        )
    }

    // -------------------------------------------------------------- dormancy

    pub fn post_notice(&mut self, gem_id: u64, admin: &Keypair) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let accounts = accounts::PostNotice {
            config: config_pda(),
            admin: admin.pubkey(),
            collection: collection_pda(),
            asset,
            notice: notice_pda(asset),
            payer: self.sponsor.pubkey(),
            system_program: anchor_lang::system_program::ID,
        };
        self.send(&[ix(accounts, instruction::PostNotice {})], &[admin])
    }

    pub fn cancel_notice(&mut self, gem_id: u64, closer: &Keypair) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let accounts = accounts::CancelNotice {
            config: config_pda(),
            collection: collection_pda(),
            asset,
            notice: notice_pda(asset),
            closer: closer.pubkey(),
            rent_payer: self.sponsor.pubkey(),
        };
        self.send(&[ix(accounts, instruction::CancelNotice {})], &[closer])
    }

    /// `owner` is the owner named in the notice.
    pub fn reclaim(
        &mut self,
        gem_id: u64,
        admin: &Keypair,
        owner: Pubkey,
        expected_amount: u64,
    ) -> TransactionResult {
        let asset = gem_pda(gem_id);
        let bidder = self.bid(asset).bidder;
        let accounts = accounts::Reclaim {
            config: config_pda(),
            admin: admin.pubkey(),
            collection: collection_pda(),
            asset,
            notice: notice_pda(asset),
            bid: bid_pda(asset),
            vault: vault_pda(asset),
            bidder,
            owner,
            owner_usdc: self.ata(owner),
            usdc_mint: self.usdc_mint,
            notice_rent_payer: self.sponsor.pubkey(),
            bid_rent_payer: self.sponsor.pubkey(),
            payer: self.sponsor.pubkey(),
            authority: authority_pda(),
            mpl_core_program: mpl_core::ID,
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        };
        self.send(
            &[ix(accounts, instruction::Reclaim { expected_amount })],
            &[admin],
        )
    }

    pub fn admin_burn_ix(&self, admin: Pubkey, asset: Pubkey) -> Instruction {
        let accounts = accounts::AdminBurn {
            config: config_pda(),
            admin,
            payer: self.sponsor.pubkey(),
            authority: authority_pda(),
            collection: collection_pda(),
            asset,
            notice: notice_pda(asset),
            rent_payer: self.sponsor.pubkey(),
            mpl_core_program: mpl_core::ID,
            system_program: anchor_lang::system_program::ID,
        };
        ix(accounts, instruction::AdminBurn {})
    }
}
