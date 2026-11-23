# On-chain design

How WikiGems cards live on Solana, what the program enforces, and what the
backend is responsible for. Status as of November 2026: **phase 1 (minting, listings, bids,
dormancy) is implemented and tested in LiteSVM; nothing is deployed.**

## Product constraints

- Every Wikipedia article maps to at most one card: a 1-of-1 NFT.
- Players see cards and dollars only. They never hold SOL or see network fees.
- The wallet is embedded and non-custodial. Its private key can be exported.
- Players must never feel their cards can be taken. WikiGems can reclaim an
  inactive player's card only by selling it to a standing public bid, after a
  30-day on-chain notice the owner can cancel, with the whole price paid to the
  owner. The program enforces this; the admin cannot skip it.

## Identity: `gem_id`, not Wikipedia IDs

Wikipedia page IDs survive renames, but they change when a page is deleted and
recreated, merged articles become redirects, and every language edition has its
own IDs. The canonical identity is therefore WikiGems' own `gem_id`: a sequential
`u64` in a server-side registry that maps to `wiki` (e.g. `enwiki`), `page_id`,
Wikidata QID, title and status (`active`/`merged`/`deleted`).

On-chain, only `gem_id` matters. The asset address is the PDA
`["gem", gem_id.to_le_bytes()]`, so minting the same gem twice fails on-chain,
independently of the database. A burned gem leaves a Core tombstone at that
address, so its ID is retired permanently. To re-issue an article, assign it a
new `gem_id`.

## Accounts

| Account    | Address                       | Role                                                                                                                                        |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Config     | PDA `["config"]`              | Admin, pending admin, mint authority, collection, USDC mint, treasury, fee, bumps, 62 reserved bytes                                        |
| Authority  | PDA `["authority"]`           | Signer only, never holds data. Update authority of the collection and holder of its `PermanentTransferDelegate` and `PermanentBurnDelegate` |
| Collection | PDA `["collection"]`          | The single Metaplex Core collection                                                                                                         |
| Gem asset  | PDA `["gem", gem_id]`         | One Core asset per gem; no per-asset plugins                                                                                                |
| Listing    | PDA `["listing", asset]`      | Seller, price, fee at listing time. At most one per card                                                                                    |
| Bid        | PDA `["bid", asset]`          | The card's single best bid: bidder, amount, when it was placed                                                                              |
| Bid vault  | PDA `["bid_vault", asset]`    | USDC token account escrowing the bid; its authority is the bid PDA                                                                          |
| Notice     | PDA `["notice", asset]`       | Dormancy notice: the owner at posting time and the posting time                                                                             |

Permanent plugins can only be attached when the collection is created, so the
delegates are installed by `initialize` and can never be added later. They are
visible on-chain to every wallet and marketplace, and the terms of service must
disclose them, together with the rules below that limit their use.

Every listing, bid and notice records who paid its rent (normally the sponsor)
and returns the rent there when it closes.

## Keys and trust

| Key                          | Lives in                                     | Can                                                                                                        |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Upgrade authority (deployer) | Offline; a time-locked multisig before mainnet | Upgrade the program; call `initialize` once                                                                |
| Admin                        | Offline now, a multisig vault before mainnet | Post dormancy notices; after 30 days, reclaim or burn; set fee (≤ 10%) and treasury; rotate the mint key; hand over admin |
| Mint authority               | Worker secret (hot)                          | Co-sign `mint_gem`. Cannot move or burn cards                                                              |
| Sponsor                      | Worker secret (hot), small balance           | Pay fees and rent. Has no program privileges                                                               |

Compromising the online mint key lets an attacker mint unclaimed gems to
themselves. The admin rotates the key with `set_mint_authority`; cards that
already exist are unaffected.

The program uses the collection's delegates in exactly three ways: a `buy` the
buyer signs, an `accept_bid` the owner signs, and an admin `reclaim` or
`admin_burn` after an uncontested 30-day notice. There is no instant admin
transfer. Even a stolen admin key must post public notices and wait, while
owners are alerted and can cancel.

These guarantees hold only as long as the program cannot be silently replaced.
Before mainnet, the upgrade authority moves to a multisig with a time lock
(Squads supports this), so players see any rule change coming.

## Instructions

| Instruction                                    | Signers                  | Effect                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize(admin, mint_authority, name, uri, fee_bps)` | payer, upgrade authority | Creates config (with USDC mint and treasury) and the collection with both permanent delegates. Rejects anyone but the upgrade authority, so the deployment cannot be front-run |
| `mint_gem(gem_id, name, uri)`                  | payer, mint authority    | Creates the gem at its PDA, owned by `owner`, who does not sign. Sweeps stray lamports that anyone sent to the address beforehand, which would otherwise block the mint |
| `list(price)`                                  | payer, owner             | Creates the card's listing. The seller keeps the card                                                                                                                  |
| `update_listing(price)`                        | seller                   | Changes the price                                                                                                                                                       |
| `cancel_listing`                               | seller, or anyone if stale | Closes the listing. A listing is stale once its seller no longer owns the card (moved, sold to a bid, reclaimed or burned)                                            |
| `buy(expected_price)`                          | payer, buyer             | Checks the seller still owns the card, pays seller (minus the listing's fee) and treasury in USDC, moves the card to the buyer                                         |
| `place_bid(amount)`                            | payer, bidder            | Escrows USDC as the card's best bid. A higher bid refunds the previous bidder in the same transaction. Works on listed and unlisted cards                               |
| `cancel_bid`                                   | bidder                   | Refunds the bid. Works even if the card was burned                                                                                                                      |
| `accept_bid(expected_amount)`                  | payer, owner             | Pays owner (minus the current fee) and treasury from the vault, moves the card to the bidder                                                                            |
| `post_notice`                                  | payer, admin             | Starts the 30-day dormancy notice on a card                                                                                                                             |
| `cancel_notice`                                | owner, admin, or anyone if stale | Closes the notice. A notice is stale once the card changes hands                                                                                               |
| `reclaim(expected_amount)`                     | payer, admin             | After 30 days, with the same owner, sells the card to its best bid if that bid has stood 7 days. Pays the **whole** amount to the owner; no fee                        |
| `admin_burn`                                   | payer, admin             | After 30 days, with the same owner, burns the card (e.g. a legal takedown). Not compensated on-chain                                                                    |
| `set_market_config(fee_bps)`                   | admin                    | Sets the treasury token account and the fee, capped at 10%. Existing listings keep their fee                                                                            |
| `set_mint_authority(key)`                      | admin                    | Rotates the online mint key                                                                                                                                             |
| `propose_admin(key)` / `accept_admin`          | admin / new admin        | Two-step handover, so a typo cannot lose admin powers                                                                                                                   |

Name ≤ 32 bytes and URI ≤ 96 bytes keep sponsored rent bounded. Use a short URI
such as `https://<domain>/g/<gem_id>`: the on-chain bytes are cheap, but wallets
need a real metadata URL to display the card.

Players keep full ownership rights: they can transfer or burn their own cards
with Core directly, and nobody else can move them outside the rules above.

Payouts always go to the recipient's USDC associated token account, created on
the spot (sponsor-paid) if missing. A recipient who closed their account
therefore cannot block a sale or an outbid refund. Every price-taking
instruction takes the amount the signer saw (`expected_price`,
`expected_amount`), so a last-second change makes it fail rather than settle at
a different price.

The admin's fee changes are capped at `MAX_FEE_BPS` (10%). A listing snapshots
the fee when it is created; `accept_bid` uses the fee at acceptance, which the
owner sees before signing.

## Measured costs

From the LiteSVM tests against mainnet Core, with mainnet rent (5,080 lamports/byte):

| Per mint                                |      Lamports |           SOL |
| --------------------------------------- | ------------: | ------------: |
| Rent, 107-byte asset                    |     1,193,800 |     0.0011938 |
| Core protocol fee (parked in the asset) |     1,500,000 |        0.0015 |
| Transaction fees, 2 signatures          |        10,000 |       0.00001 |
| **Total**                               | **2,703,800** | **0.0027038** |

- 10,000 sponsored mints ≈ **27 SOL** (≈ $2,030 at $75/SOL).
- Burning refunds only ≈ 0.00054 SOL to the payer. The Core fee and the
  tombstone's rent stay in the burned account.
- Shrinking name or URI saves 5,080 lamports per byte. The Core fee dominates.
- A player who burns their own card in a sponsor-paid transaction gets
  nothing; if they pay the burn themselves, they recover ≈ 0.0005 SOL. That's
  not worth farming free mints for, as long as free mints require verified email.

The test `mint_puts_the_gem_at_its_derived_address_without_the_owner_paying`
asserts the 0.0015 SOL Core fee, so a Metaplex fee change shows up as a failure.

## Fees without SOL

The sponsor is the fee payer of every transaction and pays all rent. The server
signs only transactions it built, and re-validates the message (an instruction
allowlist plus expected accounts) before signing. Otherwise anyone could make
the sponsor pay for arbitrary transactions.

- **Mints are paid by the player by default, in USDC.** The server adds a USDC
  transfer to the treasury to the mint transaction; the sponsor still pays the
  SOL. The price is a server setting, not program state.
- **Sponsored mints** omit that transfer. Who qualifies is server policy, e.g.
  sign-ups from the mobile app. The server must not trust a client's claim to
  be the mobile app: verify it with App Attest (iOS) or Play Integrity
  (Android), and cap sponsored mints per verified account.
- Marketplace fees (USDC) cover trading transaction costs. Reclaims carry no
  fee, so the sponsor absorbs their cost.
- Core assets need no token accounts, so receiving a card costs nothing. A
  player's first USDC token account (~0.002 SOL) is sponsored.

## Inactive players

The goal is economic activity without anyone feeling robbed. A reclaim is a
forced buyout at a price set by the market, never a confiscation:

1. **Off-chain (backend):** 6 months without activity, then SMS, email and
   in-app notices. Any login or wallet signature resets the clock.
2. **On-chain notice:** the admin calls `post_notice`. The indexer sees
   `NoticePosted` and notifies the owner again. Any action the owner signs in
   the app also sends `cancel_notice`, so an active player never reaches step 3.
3. **After 30 days** (`NOTICE_PERIOD_SECONDS`, a program constant), and only if
   the card still has the same owner:
   - `reclaim` sells it to its standing best bid. Only real demand can start
     this, the price is whatever the bidder offered, and the bid must have
     stood for 7 days (`RECLAIM_BID_MIN_AGE_SECONDS`), so the market can outbid
     a lowball offer. The owner receives the entire amount in their wallet.
   - `admin_burn` destroys it, for cases such as a legal takedown.
     Compensation is an off-chain policy. Hiding a card's metadata needs no
     burn, because the metadata URL is ours.

The owner can cancel the notice with one signature at any time, from the app or
any wallet. A player who is active on-chain but never logs in is still
protected.

Open policy questions:

- The exact off-chain inactivity rule and notification schedule (SMS needs
  phone-number collection, verification and a provider).
- Whether players who have lost their wallet can recover cards through
  support. That would need a notice-gated admin transfer, which is the very
  power players are told does not exist, so it is deliberately absent.
- Legal review of forced sales and of burning, per jurisdiction.

## Wallet

An embedded web wallet built in-house; Crossmint was evaluated and rejected, see below.

1. At sign-up the browser generates an Ed25519 keypair and wraps it with a key
   derived (HKDF) from the passkey's WebAuthn PRF output (AES-GCM). The server
   stores only the ciphertext and so is not a custodian.
2. Passkeys sync through Apple Passwords and Google Password Manager. On a new
   device, the passkey unlocks the blob.
3. Export: Settings → passkey prompt → base58 secret key, importable into Phantom
   or Solflare as the same wallet.
4. Wallet code runs on a separate origin in an iframe. The key is held as a
   non-extractable WebCrypto key for the session, so the main app never sees it.

Risks:

- Deleting every passkey without exporting loses the wallet. Mitigations: allow
  multiple passkeys, and prompt backup once a player holds value.
- PRF works with Apple Passwords (iOS 18.4+, macOS 15.4+) and Google Password
  Manager, but fails with some third-party managers and Microsoft's. Fallback:
  connect an external wallet.
- iOS 18.0–18.3 had PRF data-loss bugs: verify an unwrap round-trip before first use.
- Check whether better-auth's passkey plugin exposes PRF results; otherwise the
  wallet runs its own WebAuthn ceremony.

Crossmint wallets don't fit these requirements. Passkey signers cannot export keys,
and Solana wallets are smart-account PDAs, so an exported key wouldn't be the
wallet. Project-sponsored fees are enterprise-gated. Crossmint's standard onramp
(card, Apple Pay, Google Pay; Crossmint handles identity checks as merchant of
record) can still deliver USDC to our wallet addresses. Its confidential onramp
delivers into encrypted balances that must be unshielded before buying cards,
and it is not available in the US.

## Backend

The backend runs in the existing Cloudflare Worker (`worker/`), which already
serves the frontend and `/api/*`. The Effect service boundaries from
`apps/server` move into the Worker. Clients come from `@solana/kit` plus a
Codama client generated from `programs/wikigems/idl/wikigems_program.json`.

Responsibilities:

- The gem registry.
- Mint jobs: prepare, validate, co-sign, submit, confirm, record.
- Indexing of transfers made outside the app.
- Listing reconciliation via the existing cron.
- The inactive-player admin view.
- The sponsor balance monitor.

The legacy browser-side mint (`src/lib/solana.ts` → `mintCardNft`) must be
removed before the new mint path goes live, so only one mint authority exists.

## Roadmap

- **1a (done):** collection with permanent delegates, `mint_gem`, key rotation.
- **1 (done):** USDC config; escrowless `list` / `update_listing` /
  `cancel_listing` / `buy`; single best-bid `place_bid` / `cancel_bid` /
  `accept_bid`; `post_notice` / `cancel_notice` / `reclaim` / notice-gated
  `admin_burn`. 48 LiteSVM tests.
- **Backend (next):** gem registry, Worker mint service with USDC mint price
  and attested sponsorship, transaction builder and signing allowlist, event
  indexer (listings, bids, notices, transfers outside the app), inactivity
  tracker and notifications, admin view, Codama client, embedded wallet.
- **2:** trades and auctions.
- **Before mainnet:**
  - Admin and upgrade authority moved to multisigs; upgrades time-locked.
  - A separate mainnet program keypair.
  - Security review.
  - Terms of service updated for the delegates and the dormancy rules.
