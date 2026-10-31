# Monorepo foundations

The repository is a private Bun workspace plus a Cargo workspace. The existing
frontend, worker, shared modules, migrations, and development commands stay at
the root for now. No frontend imports or API routes have been migrated.

| Location | Responsibility |
| --- | --- |
| `src/` | Existing Solid frontend |
| `worker/`, `shared/`, `migrations/` | Existing API, game contracts, and database migrations |
| `apps/server/` | New TypeScript / Effect v4 server and service composition |
| `packages/contracts/` | New server contracts; independent of legacy UI and worker |
| `programs/wikigems/` | Native Rust Solana program foundation |
| `tsconfig.base.json` | Shared strict TypeScript settings for new workspaces |
| `Cargo.toml`, `Cargo.lock` | Rust workspace and locked dependency graph |

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

Before exposing writes, implement authenticated adapters, transaction boundaries,
unique constraints, idempotency persistence, and an outbox/job runner for chain
operations. A database transaction cannot atomically commit a Solana transaction;
use durable pending states and retry/reconciliation instead. Do not run a parallel
minting authority while the legacy mint path is active.

## Solana program

The native Rust crate has an entrypoint and intentionally rejects every instruction
with `InvalidInstructionData`. It has no accounts, transfers, mint authority,
program ID, or settlement implementation. No keys or network configuration are
required for host tests. The `no-entrypoint` feature allows future Rust clients to
reuse types without including the entrypoint.

Before adding instructions, define a versioned instruction/account format, PDA
seeds and uniqueness rules, signer/owner validation, USDC account constraints,
cancellation and settlement authority, and integration tests on a local validator.
NFT issuance can continue to use Metaplex Core; the custom program's responsibility
for listings/settlement versus mint authorization must be designed explicitly.

`bun run build:program` invokes Solana's `cargo build-sbf`, which uses its own
platform-tools compiler rather than host Rust. Flox's `solana-cli` package does
not include this subcommand, and the Flox catalog has no separate package for it.
Install the build tool explicitly before using that command:

```sh
cargo install cargo-build-sbf --version 4.4.0 --locked
cargo build-sbf --version
bun run build:program
```

This install is a separate local prerequisite, not run automatically by repository
setup. Its first build may download Solana platform tools. The foundation was
checked with host Rust; SBF compilation remains unverified until this prerequisite
is installed. Generated artifacts and program keypairs stay under ignored `target/`.
Host compilation alone does not verify an SBF build or on-chain behavior.

## Checks

```sh
bun run typecheck
bun run build
bun run check:workspaces
bun run test:server
cargo fmt --all -- --check
bun run check:program
bun run test:program
cargo clippy --workspace --all-targets --locked -- -D warnings
bun run build:program
```

Both TypeScript workspaces are private and the Rust crate has `publish = false`.
There is no deployment command for the new server or program. Existing root
publishing/deployment scripts belong to the legacy application and are unchanged.

## References

- [Effect v4 services and layers](https://effect.website/docs/v4/requirements-management/layers)
- [Solana native Rust programs and SBF builds](https://solana.com/docs/programs/rust)
