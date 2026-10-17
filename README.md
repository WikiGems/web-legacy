# WikiGems

**Every article is a card. There is only one.**

**Live:** [wikigems-app.osbyrne.workers.dev](https://wikigems-app.osbyrne.workers.dev)

WikiGems is a fan-made, browser-based trading card game built from Wikipedia. Open a pack and
you get five real Wikipedia articles, each rendered as a unique card. There are no reprints and no
duplicate supplies: one article equals one card, globally.

Cards can be collected, used in quiz duels, and traded through the in-game exchange. Any unminted
card can also be minted as a [Metaplex Core](https://www.metaplex.com/core) NFT on Solana, at which
point the 1-of-1 lives in the player's own wallet rather than the game database.

The project is a Solana-native reimagining of the WikiGems loop: packs, album, duels, exchange,
and a rarity and stats system derived from the real Wikipedia page.

## The game

- **Packs** — five unique articles per pack, one free pack every ten minutes, ten packs max.
- **Album** — every card is a 1-of-1 claim. The archive refuses to issue an article twice.
- **Rarity** — Common → Uncommon → Rare → Epic → Legendary → Mythic, based on real yearly pageviews.
- **Stats** — attack is driven by readership; defense is driven by the depth of the article.
- **Duels** — three questions generated from the descriptions of the cards in play.
- **Exchange** — list unminted cards and swap them with other collectors. Ownership moves instantly.
- **Mint** — connect Phantom, Solflare, or Backpack and mint an unminted card to your Solana wallet.

### Solana ownership model

A card starts as an in-game 1-of-1 claim. Minting is optional and non-custodial:

1. The player connects a Solana wallet and signs a message. The Worker verifies the Ed25519 signature
   and links the wallet address to the passkey account.
2. The browser builds a Metaplex Core `create` transaction with the card's metadata URI. The player's
   wallet signs and pays the devnet fee.
3. The browser sends the confirmed transaction signature to the Worker.
4. The Worker verifies the transaction through the Solana RPC, checks the asset address appears in
   the transaction, and records the mint address in Turso.
5. The card is marked **On-chain** and links to Solana Explorer.

The live build targets **Solana Devnet**. Minting requires a small amount of devnet SOL. If the
wallet has none, the UI links to the official faucet. In-game swaps remain available for unminted
cards, so the complete game is playable without a wallet.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime / package manager | Bun 1.4.2 (pinned by Flox) |
| UI | SolidJS 1.9 + `@solidjs/router` |
| Build | Vite 8 + `vite-plugin-solid` |
| Domain / API composition | Effect 4.0 |
| Auth | Better Auth 1.7 + `@better-auth/passkey` |
| Solana | `@solana/web3.js`, Umi, Metaplex Core |
| Database | Turso / libSQL through Kysely |
| Hosting | Cloudflare Workers + Workers Static Assets |
| Toolchain pinning | Flox |

The domain layer uses Effect Schema for every client/server contract. API handlers are composed with
`Effect.gen`, and the Solana verifier and Turso operations are wrapped in typed Effects.

## Run locally

### 1. Activate the pinned environment

```sh
flox activate
bun install
```

Flox pins Bun, Node, Turso CLI, Wrangler, and Solana CLI. Application dependencies are locked in
`bun.lock`.

### 2. Start the game

```sh
bun run dev
```

This command starts a local Turso server on `:8080`, applies migrations, starts Wrangler on `:8787`,
and starts Vite on `:5173` with `/api` proxied to the Worker.

Open **[http://localhost:5173](http://localhost:5173)**.

Use `localhost`, not `127.0.0.1`: the passkey RP ID is bound to `localhost` in `.dev.vars`.

The game is fully testable without a wallet. The first account is created passkey-first. A virtual
authenticator works in Chrome DevTools → **WebAuthn**, or via the included Playwright tests.

### 3. Optional: local Solana validator for minting

The mint flow can be tested end-to-end on a local validator with the Metaplex Core program cloned
from mainnet. Flox installs `solana-test-validator`.

```sh
solana-test-validator \
  --reset \
  --ledger .solana-ledger \
  --rpc-port 8899 \
  --clone-upgradeable-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d \
  --url https://api.mainnet-beta.solana.com
```

The dev server already proxies `/solana-rpc` to `127.0.0.1:8899` and `.env.development` points the
client at that proxy. Production builds ignore `.env.development` and use
`https://api.devnet.solana.com`.

The local mint test uses a temporary signing bridge and a generated, locally funded wallet:

```sh
bun run test:mint
```

It performs signup, pack opening, album selection, wallet linking, a real Metaplex Core mint, and the
Worker's transaction verification. A second test exercises the complete two-user exchange:

```sh
bun run test:trade
```

### Useful commands

```sh
bun run dev            # local Turso + Wrangler + Vite
bun run dev:db         # local Turso only
bun run dev:worker     # Worker only
bun run dev:web        # Vite only
bun run db:migrate     # apply migrations to TURSO_DATABASE_URL
bun run db:generate    # emit a fresh Better Auth schema migration for review
bun run typecheck
bun run build
bun run test:e2e       # passkey + pack + album smoke test
```

## Configuration

Local secrets live in `.dev.vars` (ignored by git). Start from `.dev.vars.example`.

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | `http://127.0.0.1:8080` locally, `libsql://…` in production |
| `TURSO_AUTH_TOKEN` | Turso token; empty locally |
| `BETTER_AUTH_SECRET` | Session/HMAC secret; at least 32 random bytes in production |
| `BETTER_AUTH_URL` | Optional auth base URL; derived from the request when omitted |
| `PASSKEY_RP_ID` | Optional WebAuthn RP ID; derived from the request host when omitted |
| `PASSKEY_ORIGIN` | Optional pinned WebAuthn origin |
| `SOLANA_RPC_URL` | Worker-side RPC used to verify mint transactions |
| `SOLANA_CLUSTER` | `devnet`, `localnet`, or `mainnet-beta`, used for explorer links |

Client-side configuration:

```sh
VITE_SOLANA_RPC_URL=/solana-rpc     # dev only; defaults to devnet in production
VITE_SOLANA_CLUSTER=localnet        # dev only; defaults to devnet in production
```

## Database

The migrations are plain SQL and tracked exactly once in a private migration ledger table:

- `migrations/000_better_auth.sql` — user, session, account, verification, passkey
- `migrations/001_game.sql` — profiles, packs, cards, trades

Important invariants:

- `cards.articleId` is `UNIQUE`. This is the database-level guarantee that one Wikipedia article is
  only ever one card.
- Minted cards are locked from in-game trading; their ownership is now a wallet concern.
- Pack stock and refill timing live on the user profile and are updated transactionally with a pack.
- Trade settlement swaps both `cards.ownerUserId` values in one transaction.

### Provision production Turso

```sh
turso auth login
turso db create wikigems

TURSO_URL="$(turso db show wikigems --url)"
TURSO_TOKEN="$(turso db tokens create wikigems)"

TURSO_DATABASE_URL="$TURSO_URL" TURSO_AUTH_TOKEN="$TURSO_TOKEN" bun run db:migrate
```

## Deploy to Cloudflare

```sh
flox activate
wrangler login

wrangler secret put TURSO_DATABASE_URL --name wikigems-app
wrangler secret put TURSO_AUTH_TOKEN --name wikigems-app
wrangler secret put BETTER_AUTH_SECRET --name wikigems-app

bun run deploy
```

`wrangler.jsonc` sets the devnet RPC and cluster as public Worker variables. The Worker serves
`dist/client`, routes `/api/*` first, and falls back to the SPA for client routes. Auth origin and
RP ID are derived from the incoming request, so passkeys work immediately on the generated
`workers.dev` hostname. Set `BETTER_AUTH_URL` and `PASSKEY_RP_ID` explicitly for a custom domain.

The Content Security Policy allows Wikimedia images and the Solana devnet RPC while keeping scripts,
fonts, and API calls same-origin.

## Card generation

`shared/featured.ts` contains 40 hand-picked Wikipedia articles with real yearly pageview counts,
fetched from the Wikipedia REST and pageview APIs. Packs draw mostly from this set plus random live
Wikipedia articles. `shared/card-engine.ts` derives rarity, attack, defense, and category.

Regenerate the featured set with:

```sh
bun run scripts/fetch-featured.ts
```

Article text is available under CC BY-SA 4.0. Card images come from Wikimedia Commons. WikiGems is
an independent fan project and is not affiliated with the Wikimedia Foundation.

## Project map

```
src/pages/Landing.tsx        marketing page and card showcase
src/pages/Play.tsx           packs, album, exchange, duels, ranking
src/components/GameCard.tsx  the card component
src/components/CardModal.tsx card detail + mint flow
src/components/PackOpening.tsx
src/components/DuelGame.tsx
src/lib/solana.ts            Phantom/Solflare/Backpack adapter, Umi mint, HTTP confirmation
src/lib/wallet.ts            wallet state and connection
worker/api.ts                Effect-composed game API
worker/wiki.ts               Wikipedia article + pageview ingestion
worker/solana.ts             server-side mint transaction verification
shared/card-engine.ts        rarity, stats, categories
shared/domain.ts             Effect schemas
migrations/                  Better Auth + game schema
scripts/                     dev orchestrator, migrations, e2e tests
```
