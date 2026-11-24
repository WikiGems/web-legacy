# Monorepo foundations

The repository is a private Bun workspace plus a Cargo workspace. The existing
frontend, Worker, shared modules, migrations, and development commands live at
the repository root.

| Location                            | Responsibility                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `src/`                              | Solid 2 frontend (Effect services, TanStack Solid Router, DaisyUI)               |
| `worker/`, `shared/`, `migrations/` | Existing API, game contracts, and database migrations                            |
| `apps/server/`                      | New TypeScript / Effect v4 server and service composition                        |
| `packages/contracts/`               | New server contracts; independent of legacy UI and worker                        |
| `programs/wikigems/`                | Anchor Solana program: minting, marketplace, dormancy ([onchain.md](onchain.md))  |
| `tsconfig.base.json`                | Shared strict TypeScript settings for new workspaces                             |
| `Cargo.toml`, `Cargo.lock`          | Rust workspace and locked dependency graph                                       |

## Local development

Activate Flox, then run `bun install --frozen-lockfile` at the repository root.
`bun run dev` continues to start the existing app. Start the separate server with
`bun run dev:server`; it binds only to `127.0.0.1:3001`. Set
`WIKIGEMS_SERVER_PORT` to choose another port. No database or secrets are required
for the foundation server.

- `GET /health`: process liveness, explicitly reports `ready: false`.
- `GET /v1/listings`: returns HTTP 501 until an adapter is implemented.
- Other routes and methods: HTTP 404. Social linking and minting have no public
  endpoints yet.

The server is scaffolded with Effect `Context.Service` boundaries and composed
`Layer`s for listings, social accounts, and minting. Adapter absence is a typed
failure, never a fabricated successful operation. The HTTP boundary translates
that failure into 501. The transport is Bun today; services do not depend on Bun.
The new server does not replace or proxy the existing worker.

## Domain and trust boundaries

The initial contracts are intentionally small, versioned by package, and separate
from the current `shared/` game contracts. Integrate or migrate those existing
schemas when the frontend migration is authorized rather than maintaining two
competing implementations of the same behavior.

Prices are USDC integer minor units encoded as canonical decimal strings, bounded
by Solana's unsigned 64-bit token amount range. One USDC is 1,000,000 minor units.
SOL remains the fee currency. Future chain adapters must verify the configured
cluster, USDC mint, token program, mint decimals, and accounts; a currency label
alone is not proof of an asset's identity.

Planned server responsibilities:

- Listings: persistent listings and offers, ownership checks, cancellation,
  settlement indexing, and reconciliation with finalized chain state.
- Social accounts: verified identity links through the auth provider, account
  ownership checks, and safe unlinking. Provider tokens stay server-side and must
  never appear in public contracts. `Actor` must come from a verified session.
- Minting: authorize an article claim, create an idempotent job, prepare a
  non-custodial transaction, verify finalization and asset ownership, and reconcile
  failures. Never accept a caller-supplied user ID as authorization.
- Other activities: add explicit services for packs, duels, and background jobs
  as they move out of the legacy worker.

The Worker uses durable purchase and claim rows because a database transaction
cannot commit atomically with a Solana transaction. Apply migration 005 before
starting the updated Worker. It preserves existing cards and trades, backfills
the gem registry, and adds listings, the two transaction journals and indexes
for locks, free-claim reservations and reconciliation.

## Worker marketplace and claim API

JSON money fields are canonical decimal strings in USDC minor units. One USDC
is `"1000000"`. Marketplace, claim, wallet, and trade writes require a
session, a trusted `Origin` header, and an `x-wikigems-account` header
matching the session user. Operation reads require the initiating account's
session.

| Method and route | Request | Response |
| --- | --- | --- |
| `POST /api/cards/:id/listing` | `{ priceUsdcMinor: string \| null }` | `{ listing: Listing \| null }`. Pass `null` to clear the price. |
| `GET /api/market/config` | Session | `{ marketFeeBps, minPriceUsdcMinor, claimPriceUsdcMinor, freeClaimsRemaining, cluster }`. |
| `GET /api/wallet/balance` | Session | `{ walletAddress, balanceUsdcMinor, dollarTokenAddress, cluster }`. An absent associated token account has balance `"0"`. |
| `POST /api/wallet/payouts` | Empty body | Payout setup status. Returns 202 while submitted. |
| `GET /api/market` | None | `{ cards, listings }` with the existing card-for-card feed and the available USDC listings. |
| `POST /api/purchases` | `{ listingId, expectedPriceUsdcMinor }` | `Purchase` with a prepared message or the same account's existing operation. |
| `POST /api/purchases/:id/sign` | `{ signature }` as base64 | Current `Purchase`. |
| `GET /api/purchases/:id` | None | Stored `Purchase`. |
| `POST /api/purchases/:id` | Empty body | Reconciles and returns the current `Purchase`. |
| `POST /api/cards/:id/claim` | `{ destination?, paid? }`. Omitting the destination uses the linked wallet. `paid: true` skips the free allowance. | `Claim` with a prepared message if paid. A free claim submits during this request. |
| `POST /api/claims/:id/sign` | `{ signature }` as base64 | Current `Claim`. |
| `GET /api/claims/:id` | None | Stored `Claim`. |
| `POST /api/claims/:id` | Empty body | Reconciles and returns the current `Claim`. |
| `GET /g/:gemId` | None | Public Metaplex-style metadata for the registered gem. |

`Listing` includes `id`, `card`, `priceUsdcMinor`, `createdAt` and
`updatedAt`. `Purchase` and `Claim` share `id`, `cardId`, `state`,
`priceUsdcMinor`, `expiresAt`, `txSignature`, `failureCode`, and
`transaction`. Purchases add `listingId` and `feeUsdcMinor`. Claims add
`destination`, `assetAddress`, and `usesFreeClaim`.

A prepared, player-signed operation returns
`transaction: { message, requiredSigners, signerAddress, lastValidBlockHeight }`.
Decode `message` from base64, sign the raw bytes directly using
`signerAddress`, and send only the base64 signature. The remaining signers
are server-side. For other states or a server-signed claim, `transaction` is
null. Free claims and sign requests return 202 while submitted. Poll the
reconciliation route until `settled`, `failed`, `expired`, or
`refund_required`. On expiry request a new preparation. A transaction
signature can appear before delivery.

Errors use `{ error, code }`. Wallet setup is signaled by `WALLET_REQUIRED`
or `SELLER_WALLET_REQUIRED`. The prepare route can reject stale prices
(`PRICE_CHANGED`), cards in proposed trades (`TRADE_PENDING`), and locked
cards (`CARD_LOCKED`). Handle `TRANSACTION_EXPIRED` by preparing again.
When a free claim returns `FREE_CLAIM_BUDGET_EXHAUSTED`, offer the paid
price and send `paid: true` only after the player chooses it.

Buy, Sell, Collection, Trade, and Wallet read the Worker through the shared
`Api` Effect service. The game state includes an optional `priceUsdcMinor`
on the owner's actively listed cards, including when the public feed hides a
locked listing. Purchase and claim dialogs keep their draft when setting up
or unlocking a wallet, then poll with backoff until the Worker reports a
terminal state. The Add dollars panel encodes the linked address locally in
a QR code. The optional `VITE_DOLLARS_ONRAMP_ENABLED` build flag exposes a
disabled control where a provider can be added.

### Worker chain configuration

| Setting | Default or required value |
| --- | --- |
| `SOLANA_RPC_URL`, `SOLANA_CLUSTER` | Devnet. Use a history-capable RPC for reconciliation and the same network for the wallet. |
| `SPONSOR_SECRET_KEY` | Base58-encoded 64-byte fee-payer keypair. Keep enough SOL for fees and rent. |
| `MINT_AUTHORITY_SECRET_KEY` | Base58-encoded 64-byte keypair matching the program's Config mint authority. |
| `WIKIGEMS_PROGRAM_ID` | `3KBQ1Y9YZbKmYKhnXM1u8fcEBHEtizgW3hcBZSYnuUjL`. |
| `USDC_MINT` | Devnet USDC, `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Use the proper mint when configuring another network. |
| `TREASURY_WALLET` | Required wallet address. Its USDC ATA must match the program's Config treasury token account for claims. |
| `MARKET_FEE_BPS` | `250` (2.5%). |
| `CLAIM_PRICE_USDC_MINOR` | `250000` (0.25 USDC). Must be positive. |
| `FREE_CLAIMS_PER_USER` | `1` per verified-email account. |
| `PUBLIC_ORIGIN` | Required for claims. Supply the HTTPS origin that will serve gem metadata. |

Store the signing keys as Worker secrets. Local development starts without
either signing key. Add them via the existing Keychain settings command when
testing chain writes. Purchase preparation and claim preparation return a typed
503 `CHAIN_NOT_CONFIGURED` when their required configuration is missing.
Minted ownership reconciliation and submitted transaction verification use the
RPC and persisted messages without loading either signing key.

## Solana program

`programs/wikigems` is an Anchor 1.2.2 program. The design, decisions, measured
costs and roadmap are in [`onchain.md`](onchain.md). Phase 1 is implemented:
minting, escrowless listings, public bids, and the notice-gated reclaim and burn
of dormant cards. The Worker currently calls the mint instruction for claims.

Tests run the compiled program against the real mainnet Metaplex Core binary in
LiteSVM, inside `cargo test`. No validator, keys or network configuration are
needed beyond the one-time fixture download.

`bun run build:program` invokes Solana's `cargo build-sbf`, which uses its own
platform-tools compiler rather than host Rust. Flox's `solana-cli` package does
not include this subcommand, so install the tools explicitly (a separate local
prerequisite, not run by repository setup):

```sh
cargo install cargo-build-sbf --version 4.6.0 --locked   # platform-tools v1.58
cargo install anchor-cli --version 1.2.2 --locked        # IDL generation
bun run test:program   # fetches Core, builds the .so, runs the LiteSVM tests
bun run idl:program    # regenerates programs/wikigems/idl/wikigems_program.json
```

`scripts/fetch-test-programs.ts` downloads Metaplex Core from mainnet into the
ignored `programs/wikigems/tests/fixtures/` and pins it by SHA-256, so an upstream
upgrade fails loudly. The program keypair that `cargo build-sbf` generates stays in
ignored `target/deploy/`. It defines the devnet program ID in `declare_id!` and
`Anchor.toml`. Generate and store a separate mainnet keypair before mainnet.

## Browser market checks

Build the client, then run the account harness with `--market` or use
`bun run test:market`. The harness runs the built Solid app in Chromium with
independent virtual PRF authenticators. The fixture seeds owned cards and a
verified email to exercise the free claim. The Worker routes, wallet vault,
SQLite ownership, signing, and settlement checks are real. A local HTTP RPC
fixture supplies token account data and blockhashes, records signed wires,
and finalizes those wires when the test advances. This covers delivery and
claim reconciliation without contacting a public chain. The fixture does
not execute transfers or program instructions. The LiteSVM integration
check executes the Worker-built messages against the compiled programs.
The `--trade` flag tests the card-for-card exchange without RPC.

## Checks

```sh
bun run typecheck
bun run build
bun run check:workspaces
bun run test:server
cargo fmt --all -- --check
bun run check:program
bun run test:program
bun run test:chain:integration
cargo clippy --workspace --all-targets --locked -- -D warnings
bun run build:program
```

Both TypeScript workspaces are private and the Rust crate has `publish = false`.
There is no deployment command for the new server or program. Existing root
publishing/deployment scripts belong to the legacy application and are unchanged.

## References

- [Effect v4 services and layers](https://effect.website/docs/v4/requirements-management/layers)
- [Solana Rust programs and SBF builds](https://solana.com/docs/programs/rust)
- [Metaplex Core](https://developers.metaplex.com/core)
- [LiteSVM](https://github.com/LiteSVM/litesvm)
