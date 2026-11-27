# Infrastructure as Code (Alchemy + Effect)

WikiGems manages its cloud and GitHub infrastructure as pure TypeScript + Effect programs in the [`@wikigems/infra`](../infra/package.json) workspace using [Alchemy](https://alchemy.run) (`alchemy@2.0.0-beta.87`).

## Architecture overview

| Stack | Entrypoint | Providers | What it manages |
| --- | --- | --- | --- |
| App & Cloud (`wikigems`) | [`infra/alchemy.run.ts`](../infra/alchemy.run.ts) | `@alchemy.run/cloudflare`, `@alchemy.run/turso` | Per-stage Turso DB, expiring DB auth token, private R2 avatars bucket, Cloudflare Worker + static SPA assets, cron triggers, secrets, and version tags |
| GitHub Governance (`wikigems-github`) | [`infra/github.run.ts`](../infra/github.run.ts) | `@alchemy.run/github` | Repo merge & branch-GC settings (`deleteBranchOnMerge`, squash/rebase-only, auto-merge), `protect-main` branch ruleset, `protect-release-tags` tag ruleset, `preview` & `production` environments |

Both stacks store encrypted state in Cloudflare's State Store (`wikigems-alchemy-state`) via [`infra/src/state.ts`](../infra/src/state.ts), so local runs and GitHub Actions share one source of truth. Pass `ALCHEMY_STATE_STORE=local` only for offline sandboxing.

## Key design decisions

### 1. Ephemeral per-PR Turso databases (Previews)

Every pull request deploys to an isolated Alchemy stage `pr-<number>` with:
- Worker: `wikigems-pr-<number>` (no cron triggers)
- R2 bucket: `wikigems-avatars-pr-<number>` (`forceDestroy: true`)
- Turso DB: `wikigems-pr-<number>` (ephemeral, `deleteProtection: false`, 7-day token)

**Why ephemeral per-PR DBs instead of one shared staging DB:**
- Concurrent PRs with schema changes in `migrations/` never collide or lock each other out.
- Every PR proves all migrations apply cleanly from scratch on real Turso.
- Closing or merging the PR runs `alchemy destroy --stage pr-<number>`, tearing down the Worker, R2 bucket, and Turso DB automatically with zero leftover data or cost drift.

### 2. Production deletion guards

In `prod`, [`infra/alchemy.run.ts`](../infra/alchemy.run.ts) enables:
- `deleteProtection: true` on the Turso database
- `forceDestroy: false` on the R2 avatars bucket
- `Alchemy.RemovalPolicy.protect(true)` on both the database and R2 bucket (Alchemy refuses to plan or apply a destroy/replacement of stateful prod resources)

### 3. Safe releases & instant rollbacks

Production releases are triggered by **immutable SemVer tags (`vX.Y.Z`)**, not every push to `main`:
- `refs/tags/v*` are protected by the `protect-release-tags` ruleset (no deletion, no force-update).
- `.github/workflows/release.yml` verifies the tagged commit is an ancestor of `origin/main`, runs the full check & build suite, plans and deploys via Alchemy, applies forward-only migrations, and runs a live smoke test ([`scripts/smoke-check.ts`](../scripts/smoke-check.ts)).
- If the post-deploy smoke test fails, the release workflow **automatically rolls back** Cloudflare traffic to the previous healthy Worker version.
- Manual rollbacks are always available via **Actions → Production Rollback** (`.github/workflows/rollback.yml`):
  - `instant` mode (~2–5s): atomically shifts 100% traffic to the previous healthy Worker version (or an explicit tag/version UUID) via Cloudflare's Versions/Deployments API ([`infra/scripts/rollback-worker.ts`](../infra/scripts/rollback-worker.ts)).
  - `redeploy-tag` mode: checks out an earlier `vX.Y.Z` tag and runs a full Alchemy deploy.

> **Database migration discipline (expand-and-contract):**
> Because Worker code rollbacks do not revert SQL migrations, keep every migration in `migrations/` forward-only and backward-compatible with the previous release (add columns/tables first; only drop obsolete columns in a later release after no live version reads them).

## One-time GitHub Environments bootstrap

GitHub Environments (`preview` and `production`) are already provisioned. Add scoped credentials to each environment under **Settings → Environments** so preview PRs can never touch production secrets.

### `preview` environment

| Kind | Name | Required | Notes |
| --- | --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Yes | Scoped to Workers Scripts, R2 Storage, Account Settings (read) |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID |
| Secret | `TURSO_API_TOKEN` | Yes | Turso Platform API token (scoped to preview org/group) |
| Secret | `BETTER_AUTH_SECRET` | Yes | Random 32+ byte secret for preview sessions |
| Secret | `RESEND_API_KEY` | No | Optional preview email testing |
| Secret | `SPONSOR_SECRET_KEY` | No | Optional devnet fee-payer keypair |
| Secret | `MINT_AUTHORITY_SECRET_KEY` | No | Optional devnet mint-authority keypair |
| Variable | `TURSO_ORG` | Yes | Turso organization slug |
| Variable | `TURSO_GROUP` | No | Defaults to `default` |
| Variable | `TREASURY_WALLET` | No | Optional devnet treasury wallet address |
| Variable | `EMAIL_FROM` | No | Optional sender address |

### `production` environment

All secrets/variables above (using **production-scoped** tokens and secrets), plus:

| Kind | Name | Required | Notes |
| --- | --- | --- | --- |
| Secret | `GH_GOVERNANCE_TOKEN` | Optional | Fine-grained PAT (repo Administration + Environments write) for `.github/workflows/infra-github.yml` |
| Variable | `WIKIGEMS_CUSTOM_DOMAIN` | Optional | Custom hostname attached to the prod Worker (e.g. `wikigems.gg`) |
| Variable | `PUBLIC_ORIGIN` | Recommended | Canonical `https://...` origin for gem metadata |
| Variable | `BETTER_AUTH_URL` | Optional | Explicit auth origin (defaults to request origin) |
| Variable | `PASSKEY_RP_ID` | Optional | Explicit WebAuthn RP ID for custom domain |
| Variable | `PASSKEY_ORIGIN` | Optional | Explicit WebAuthn origin for custom domain |
| Variable | `TRUSTED_ORIGINS` | Optional | Comma-separated allowed origins |
| Variable | `SOLANA_CLUSTER` | Optional | Defaults to `devnet` |
| Variable | `SOLANA_RPC_URL` | Optional | Defaults to `https://api.devnet.solana.com` |
| Variable | `WIKIGEMS_PROGRAM_ID` | Optional | Defaults to devnet program ID |
| Variable | `USDC_MINT` | Optional | Defaults to devnet USDC mint |

## First-time local / CI adoption

If your Cloudflare account or Turso org already has resources named `wikigems` or `wikigems-avatars`, run the initial deploy with `--adopt` so Alchemy imports them cleanly into state instead of failing on name conflicts:

```sh
# 1. Bootstrap the Cloudflare State Store once
bun run --cwd infra alchemy state bootstrap --backend cloudflare --name wikigems-alchemy-state

# 2. Adopt existing GitHub repo, rulesets, and environments
bun run infra:github:deploy -- --stage main --adopt

# 3. Preview and deploy production (first time with --adopt if resources already exist)
bun run build
bun run infra:plan -- --stage prod
bun run infra:deploy -- --stage prod --adopt
bun run db:migrate:stage -- --stage=prod
```

## Useful commands

```sh
bun run infra:plan -- --stage prod           # diff prod cloud stack
bun run infra:deploy -- --stage prod         # deploy prod cloud stack
bun run infra:drift -- --stage prod          # detect cloud drift
bun run infra:destroy -- --stage pr-42       # tear down an ephemeral preview stage
bun run infra:github:plan -- --stage main    # diff GitHub settings & rulesets
bun run db:migrate:stage -- --stage=prod     # apply SQL migrations via ephemeral 10m Turso token
bun run db:check                             # verify all migrations apply cleanly from scratch
bun run smoke https://wikigems.example.com   # run live HTTP + API smoke check
```
