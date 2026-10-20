# WikiGems

**Every article is a card. There is only one.**

**Status:** not currently deployed. A Turso database named `wikigems` is available for development;
the previous Cloudflare deployment has been removed.
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

| Layer                     | Choice                                     |
| ------------------------- | ------------------------------------------ |
| Runtime / package manager | Bun 1.4.2 (pinned by Flox)                 |
| UI                        | SolidJS 1.9 + `@solidjs/router`            |
| Build                     | Vite 8 + `vite-plugin-solid`               |
| Domain / API composition  | Effect 4.0                                 |
| Auth                      | Better Auth 1.7 + `@better-auth/passkey`   |
| Solana                    | `@solana/web3.js`, Umi, Metaplex Core      |
| Database                  | Turso / libSQL through Kysely              |
| Hosting                   | Cloudflare Workers + Workers Static Assets |
| Toolchain pinning         | Flox                                       |

The domain layer uses Effect Schema for every client/server contract. API handlers are composed with
`Effect.gen`, and the Solana verifier and Turso operations are wrapped in typed Effects.

## Run locally

### 1. Activate the pinned environment

```sh
flox activate
bun install
```

Flox pins Bun, Node, Turso CLI, Wrangler, Solana CLI, SOPS, and age through the manifest and lockfile.
Application dependencies are locked in `bun.lock`. Flox works on macOS and Linux; no separate Nix
installation or system rebuild is needed for the development workflow.

### 2. Unlock the encrypted environment

```sh
bun run secrets:decrypt
```

The repository stores `secrets/development.env` encrypted with SOPS and age. You need a private
age key matching a recipient in `.sops.yaml`; the public recipient alone cannot decrypt it.
On this Mac, the existing key is at `~/.config/sops/age/keys.txt`. For another machine,
see **Adding a developer or machine** below.

The script finds keys in `$XDG_CONFIG_HOME/sops/age/keys.txt` (defaulting to
`~/.config/sops/age/keys.txt`) or `~/Library/Application Support/sops/age/keys.txt` on macOS.
Set `SOPS_AGE_KEY_FILE=/absolute/path/to/keys.txt` to use a different key location.

### 3. Start the game

```sh
bun run dev
```

This command decrypts the environment automatically, uses the configured database, applies
migrations, starts Wrangler on `:8787`, and starts Vite on `:5173` with `/api` proxied to the Worker.
With the local database URL `http://127.0.0.1:8080`, it also starts a local Turso server on `:8080`.

Open **[http://localhost:5173](http://localhost:5173)**.

Use `localhost`, not `127.0.0.1`: the passkey RP ID is bound to `localhost` in `.env`.

The game is fully testable without a wallet. The first account is created passkey-first. A virtual
authenticator works in Chrome DevTools → **WebAuthn**, or via the included Playwright tests.

### 4. Optional: local Solana validator for minting

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
bun run dev            # configured Turso (or local server) + Wrangler + Vite
bun run dev:db         # local Turso only
bun run dev:worker     # Worker only
bun run dev:web        # Vite only
bun run db:migrate     # decrypt development config and apply migrations
bun run db:generate    # emit a fresh Better Auth schema migration for review
bun run secrets:edit   # edit the encrypted environment with SOPS and $EDITOR
bun run secrets:decrypt # refresh the ignored .env from ciphertext
bun run secrets:encrypt # encrypt local .env changes for committing
bun run typecheck
bun run build
bun run test:e2e       # passkey + pack + album smoke test
```

## Install as an app

Production builds include a web app manifest, install icons, and a service worker for the whole
site. Install WikiGems from the browser's install menu or Add to Home Screen. The installed app
launches `/play`: signed-in users enter the game, and signed-out users go to `/login`. Signed-in
visits to `/` and `/login` also open `/play`.

After the first online visit, the app shell can load offline. Signing in, syncing cards, trading,
and minting require a connection. Authentication, game data, and wallet requests are never stored
in the service worker cache. New versions activate after existing app windows close.

The service worker is enabled in production builds, so Vite development stays free of cached
bundles. To preview the installable build locally, run `bun run build` followed by `bun run preview`.

## Configuration

`secrets/development.env` is the committed source of secrets. `.sops.yaml` contains only public
age recipients. The decrypted `.env` stays local, ignored by Git, with permissions `0600`.
It remains on disk after stopping the app; remove it when no longer needed. Never commit private
age keys, plaintext `.env` files, or decrypted values in Nix expressions or Flox manifests.

`dev`, `dev:web`, `dev:worker`, `db:migrate`, and `db:generate` decrypt before running. The wrapper
reloads the new values explicitly, so Bun cannot pass stale credentials from an older `.env` to
child processes. Wrangler reads that same file. Decryption failure stops the command and leaves
the last working `.env` untouched. Remove any old `.dev.vars`: Wrangler gives it precedence over
`.env`, so the wrapper refuses to run while it exists. Only `VITE_` variables reach browser code;
never give a secret that prefix.

### Editing and committing secrets

Activate Flox first, then edit the encrypted source directly:

```sh
bun run secrets:edit
bun run secrets:decrypt
git add secrets/development.env .sops.yaml
git commit -m "Update encrypted development environment"
```

Alternatively, edit the ignored `.env`, then run `bun run secrets:encrypt` **before** restarting
dev or running migrations; those commands refresh `.env` from the encrypted source.
`.env.example` documents the settings for an independent database. To use it, copy it to `.env`,
set a random `BETTER_AUTH_SECRET` (`openssl rand -base64 48`), configure your database, and encrypt
the file with your own recipient before starting dev.

### Adding a developer or machine

Generate a key on the new machine without overwriting an existing one:

```sh
flox activate
mkdir -p ~/.config/sops/age
chmod 700 ~/.config/sops/age
test -e ~/.config/sops/age/keys.txt || age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt
age-keygen -y ~/.config/sops/age/keys.txt
```

Give the resulting **public** `age1…` recipient to someone who can already decrypt the file.
They add it to the comma-separated `age` recipients in `.sops.yaml`, then run:

```sh
SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt" sops updatekeys secrets/development.env
git add .sops.yaml secrets/development.env
git commit -m "Authorize a development secrets recipient"
```

The new machine can then pull and run `bun run dev`. Back up private keys securely outside Git;
losing every authorized key makes the encrypted file unrecoverable. To revoke a recipient, remove
it from `.sops.yaml`, run `sops updatekeys` and `sops rotate --in-place secrets/development.env`,
and replace the actual Turso token and Better Auth secret: old Git revisions remain decryptable
with the removed key. Re-encrypt the new credentials before committing.

### sops-nix on NixOS or nix-darwin

Flox supplies the SOPS CLI for development. [sops-nix](https://github.com/Mic92/sops-nix) provides
activation-time decryption for a Nix-managed host. This project's locked `flake.nix` exports
`nixosModules.default` and `darwinModules.default`, both using the same encrypted dotenv file.
The module provisions the whole file as `sops.secrets."wikigems.env"` with mode `0400`.

Add the project as a Git-backed input to your **host** flake, using its absolute checkout path
(or a committed Git URL). A Git-backed source excludes ignored plaintext files:

```nix
inputs.wikigems.url = "git+file:///absolute/path/to/web-legacy";
```

Add `wikigems` to the host flake's `outputs` arguments and import the module in its existing
`darwinSystem` modules list:

```nix
modules = [
  wikigems.darwinModules.default
  ({ ... }: {
    # A string path outside the Nix store; the key must already exist.
    sops.age.keyFile = "/Users/osbyrne/.config/sops/age/keys.txt";
    sops.secrets."wikigems.env".owner = "osbyrne";
  })
];
```

For NixOS use `wikigems.nixosModules.default` in `nixosSystem.modules` and set the appropriate
Linux username and key path. The host user must exist in its Nix configuration. Authorize that
key's public recipient as described above, update the host's `wikigems` flake input after pulling
changes, then apply your normal host rebuild. No host configuration is changed by `flox activate`.
Only encrypted data is referenced by the project module; decryption happens during activation.
Do not use `builtins.readFile` on plaintext secrets or a private key.

After activation, use the file provisioned by sops-nix:

```sh
flox activate
WIKIGEMS_ENV_FILE=/run/secrets/wikigems.env bun run dev
```

Use `config.sops.secrets."wikigems.env".path` if your host overrides the default location.
`WIKIGEMS_ENV_FILE` makes the wrapper copy that already-decrypted file to the ignored `.env`
instead of invoking SOPS. The same option works for `dev:web`, `dev:worker`, and database commands.

| Variable             | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `TURSO_DATABASE_URL` | `http://127.0.0.1:8080` locally, `libsql://…` in production         |
| `TURSO_AUTH_TOKEN`   | Turso token; empty locally                                          |
| `BETTER_AUTH_SECRET` | Session/HMAC secret; at least 32 random bytes in production         |
| `BETTER_AUTH_URL`    | Optional auth base URL; derived from the request when omitted       |
| `PASSKEY_RP_ID`      | Optional WebAuthn RP ID; derived from the request host when omitted |
| `PASSKEY_ORIGIN`     | Optional pinned WebAuthn origin                                     |
| `SOLANA_RPC_URL`     | Worker-side RPC used to verify mint transactions                    |
| `SOLANA_CLUSTER`     | `devnet`, `localnet`, or `mainnet-beta`, used for explorer links    |

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

# Use the raw script for an explicitly supplied production environment;
# db:migrate deliberately reloads the encrypted development credentials.
TURSO_DATABASE_URL="$TURSO_URL" TURSO_AUTH_TOKEN="$TURSO_TOKEN" bun run scripts/migrate.ts
```

## Deployment notes (for future releases)

```sh
flox activate
wrangler login

wrangler secret put TURSO_DATABASE_URL --name wikigems
wrangler secret put TURSO_AUTH_TOKEN --name wikigems
wrangler secret put BETTER_AUTH_SECRET --name wikigems

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
