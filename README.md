# WikiTrade

**Research in public. Conviction on record.**

**Live:** [wikitrade.osbyrne.workers.dev](https://wikitrade.osbyrne.workers.dev)

WikiTrade is a collaborative market-research wiki and paper-trading desk. Contributors publish
ticker-linked theses, mark a stance and conviction, and save notes to a personal desk. Sign-in is
passkey-first: there is no password field anywhere in the product.

The site pairs a SolidJS editorial front end with a Cloudflare Worker API, Better Auth passkeys, an
Effect v4 domain layer, and a Turso/libSQL database for accounts, sessions, credentials, and each
user's watchlist.

## The stack

| Layer | Choice |
| --- | --- |
| Runtime / package manager | [Bun](https://bun.sh) 1.4.2 (pinned by Flox) |
| UI | [SolidJS](https://www.solidjs.com) 1.9 + `@solidjs/router` |
| Build | Vite 8 + `vite-plugin-solid` |
| Domain / API composition | [Effect](https://effect.website) 4.0 |
| Auth | [Better Auth](https://better-auth.com) 1.7 + `@better-auth/passkey` |
| Database | [Turso](https://turso.tech) (libSQL) through Kysely |
| Hosting | Cloudflare Workers + Workers Static Assets |
| Toolchain pinning | [Flox](https://flox.dev) |

`effect` is used for typed response decoding on the client and for the Worker's app-API control flow.
The schemas in `shared/domain.ts` are the single source of truth for entries, pulses, watchlists, and
onboarding requests.

## Run it locally

### 1. Activate the pinned environment

```sh
flox activate
bun install
```

Flox pins Bun, Node, the Turso CLI, and Wrangler. The application dependencies are locked separately
in `bun.lock`.

### 2. Start the whole stack

```sh
bun run dev
```

This one command:

1. starts `turso dev` on `127.0.0.1:8080` using `.data/wikitrade.db` (unless it is already running),
2. applies the migrations,
3. compiles the static front end once so Wrangler has an assets directory,
4. starts the Worker with `wrangler dev` on `:8787`,
5. starts Vite on `:5173` with `/api` proxied to the Worker.

Open **[http://localhost:5173](http://localhost:5173)**.

> Use `localhost`, not `127.0.0.1`. WebAuthn binds the passkey to the `localhost` RP ID configured in
> `.dev.vars`; the origin in the browser must match.

The first time you click **Open your desk**, you will be asked for a display name and email. The
browser then creates a discoverable passkey (Touch ID / Face ID / Windows Hello / security key or a
synced password manager). A signed, ten-minute onboarding token ties the WebAuthn ceremony to the
profile. The user row and passkey row are only created after the authenticator verifies, so a
cancelled prompt leaves no orphan account.

To test without a physical authenticator, use Chrome DevTools → **WebAuthn** → **Enable virtual
authenticator**, or run the included Playwright smoke test:

```sh
bun run test:e2e
```

The smoke test uses the installed Google Chrome and a CTAP2 virtual authenticator to exercise sign-up,
the Turso-backed watchlist, sign-out, and passkey sign-in.

### Useful individual commands

```sh
bun run dev:db        # local Turso only
bun run dev:worker    # Worker only (expects the local DB and dist/client)
bun run dev:web       # Vite only
bun run db:migrate    # apply migrations to TURSO_DATABASE_URL
bun run db:generate   # emit a new auth migration (writes .generated.sql if 000 exists)
bun run typecheck
bun run build
```

## Configuration

Local secrets live in `.dev.vars` (ignored by git). Start from `.dev.vars.example`.

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | `http://127.0.0.1:8080` locally, `libsql://…` in production |
| `TURSO_AUTH_TOKEN` | Turso database token; empty locally |
| `BETTER_AUTH_SECRET` | HMAC/session secret; at least 32 random bytes in production |
| `BETTER_AUTH_URL` | Optional. Base auth origin. Derived from the request when omitted |
| `PASSKEY_RP_ID` | Optional. RP ID. Derived from `BETTER_AUTH_URL`/request host when omitted |
| `PASSKEY_ORIGIN` | Optional. Pins the expected WebAuthn origin. Request `Origin` is used when omitted |
| `TRUSTED_ORIGINS` | Optional comma-separated extra origins for Better Auth |

Production derives the auth origin and RP ID from the incoming request, so a fresh `workers.dev`
deployment works without hard-coding its hostname. Set `BETTER_AUTH_URL`, `PASSKEY_RP_ID`, and
`PASSKEY_ORIGIN` if you attach a custom domain or want to pin the origin explicitly.

## Database

The migrations are plain SQL and are applied exactly once, tracked in `_wikitrade_migrations`:

- `migrations/000_better_auth.sql` — `user`, `session`, `account`, `verification`, `passkey`
- `migrations/001_watchlist.sql` — the per-user saved-note table

Better Auth's schema is generated from the live auth configuration with
`getMigrations(...).compileMigrations()`; the app table references `user(id)` with `on delete cascade`.

`bun run db:generate` never overwrites the committed `000_better_auth.sql`: if it already exists, it writes
`migrations/000_better_auth.generated.sql` for review.

### Create the production Turso database

```sh
turso auth login
turso db create wikitrade

TURSO_URL="$(turso db show wikitrade --url)"
TURSO_TOKEN="$(turso db tokens create wikitrade)"

TURSO_DATABASE_URL="$TURSO_URL" \
TURSO_AUTH_TOKEN="$TURSO_TOKEN" \
bun run db:migrate
```

## Deploy to Cloudflare

```sh
flox activate
wrangler login

wrangler secret put TURSO_DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
# paste a value from: openssl rand -base64 32
wrangler secret put BETTER_AUTH_SECRET

bun run deploy
```

The Wrangler config serves `dist/client` as static assets, sends `/api/*` to the Worker first, and
uses the SPA fallback for client routes. Wrangler prints the deployed `https://…workers.dev` URL.
Because auth origin/RP ID are request-derived, passkeys work on that URL immediately.

For a custom domain, add the route/domain in `wrangler.jsonc`, then set:

```sh
wrangler secret put BETTER_AUTH_URL     # https://trade.example.com
wrangler secret put PASSKEY_RP_ID       # trade.example.com
wrangler secret put PASSKEY_ORIGIN      # https://trade.example.com
bun run deploy
```

Cloudflare's runtime needs the `nodejs_compat` flag, which is already enabled. The Wrangler version
pinned in Flox (4.148.0) supports the compatibility date in `wrangler.jsonc` (2026-10-13).

## Project map

```
src/                  SolidJS app
  pages/Landing.tsx   editorial landing page
  pages/Desk.tsx      authenticated watchlist, passkeys, account
  components/         nav, auth modal, ticker, cards, icons, charts
  lib/api.ts          Effect v4 fetch/decode pipelines
  lib/auth-client.ts  Better Auth Solid client + passkey plugin
worker/
  index.ts            Worker entry: auth, API, static assets
  auth.ts             Better Auth + passkey-first registration
  api.ts              Effect-composed app API and watchlist
  onboarding.ts       signed HMAC onboarding context
  db.ts               Kysely + libSQL/Turso dialect
shared/
  domain.ts           Effect Schema contracts
  content.ts          editorial seed data
migrations/           generated auth schema + watchlist
scripts/              dev orchestrator, migration runner, schema generator, smoke test
.flox/                pinned toolchain
```

## Auth flow

1. `POST /api/onboarding/context` validates the display name/email and returns an HMAC-signed,
   ten-minute context token containing a new user ID.
2. `authClient.passkey.addPasskey({ context, createSession: true })` requests registration options
   from Better Auth and invokes the browser's WebAuthn ceremony.
3. Better Auth's `registration.resolveUser` verifies the context for the options step.
4. On verification, `registration.afterVerification` creates the Turso user row in the same
   transaction as the passkey row, then Better Auth creates the session cookie.
5. Sign-in uses a discoverable credential via `authClient.signIn.passkey()`; no email lookup is
   needed. Additional passkeys can be added from the desk.

The account email is never used to attach a new passkey to an existing account. A pre-existing email
is rejected before the ceremony, which avoids account-takeover through a supplied email address.

## Notes

- Research is illustrative. Prices, conviction scores, and market data are editorial seed content,
  not investment advice.
- All UI copy, iconography, and chart rendering are local; fonts are self-hosted through Fontsource.
- The site is responsive at 320 px and up, respects `prefers-reduced-motion`, and uses native dialog
  semantics (`role="dialog"`, `aria-modal`, keyboard close) for the auth modal.
