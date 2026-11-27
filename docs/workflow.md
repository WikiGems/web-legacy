# Development workflow

`main` is protected. Nothing is committed to it directly: every change arrives
through a pull request that passes CI. See [`infrastructure.md`](infrastructure.md)
for the Alchemy TypeScript/Effect IaC setup, environment secrets, and rollback runbook.

## The loop

```sh
git switch -c <topic>          # branch off main
# ...work, commit...
git push -u origin <topic>     # pre-push hook runs the full check suite
gh pr create                   # CI + ephemeral PR preview run; merge when green
git switch main && git pull    # post-merge hook automatically prunes merged branches
```

Merges are squash or rebase only (`allow_merge_commit = false`), so `main` stays
linear. GitHub automatically deletes the remote head branch upon merge
(`delete_branch_on_merge = true`).

## Checks

| Check        | Tool      | Command                                         |
| ------------ | --------- | ----------------------------------------------- |
| Format       | oxfmt     | `bun run format:check` (fix: `bun run format`)  |
| Lint         | oxlint    | `bun run lint` (fix: `bun run lint:fix`)        |
| Types        | tsc       | `bun run typecheck && bun run check:workspaces` |
| Build        | vite      | `bun run build`                                 |
| Architecture | bun       | `bun run check:architecture`                    |
| Migrations   | libsql    | `bun run db:check`                              |
| Tests        | vitest    | `bun run test` (watch: `bun run test:watch`)    |

`bun run check` runs format, lint, typecheck, workspace typechecks (including
`@wikigems/infra`), and Vitest tests. Tests import from `vitest`, but run under
the Bun runtime (`bun --bun vitest`) because several use `bun:sqlite` and
`Bun.*`. Always use `bun run test`, not bare `vitest`.

Formatting covers code, JSON and CSS, not Markdown. Config lives in
`.oxfmtrc.json`, `.oxlintrc.json`, `.editorconfig`, and `vitest.config.ts`.

## Git hooks (lefthook)

Installed automatically by `bun install`.

- **pre-commit**: formats staged files (and re-stages them), lints them,
  typechecks, and runs only the tests related to the staged files.
- **pre-push**: runs the same checks as CI over the whole repo, and refuses any
  push that targets `main`.
- **post-merge**: when pulling `main`, runs `bun scripts/git-prune.ts --no-fetch`
  to remove local branches that have already been merged or squash-merged.

Skip once with `LEFTHOOK=0 git commit ...`. CI re-runs everything, so skipping
only defers the failure.

## Branch garbage collection

Because `main` uses squash merges, plain `git branch --merged` does not detect
squash-merged local branches. Branch cleanup is automated on both sides:

- **Remote**:
  - `delete_branch_on_merge` is enabled on GitHub (and managed in `infra/github.run.ts`).
  - `.github/workflows/branch-gc.yml` runs weekly (and via manual dispatch) to
    prune any leftover merged or squash-merged remote branches without open PRs.
- **Local**:
  - Run `bun run git:prune:dry` to preview or `bun run git:prune` to prune merged
    and squash-merged local branches plus stale worktrees (never deletes `main`,
    `HEAD`, active worktrees, or unmerged branches).
  - Pulling `main` also triggers local pruning automatically via the `post-merge`
    lefthook job.

## CI/CD workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | PR, push to `main` | Format, lint, typecheck (+ `infra`), build & architecture, migration smoke check, Vitest, Gitleaks secret scan, and single required `CI` gate |
| [`preview.yml`](../.github/workflows/preview.yml) | PR open/sync/close | Deploys an isolated Alchemy preview (`pr-<N>` Worker + R2 + ephemeral Turso DB), runs migrations + live smoke check, comments preview URL, and destroys all preview resources when closed |
| [`release.yml`](../.github/workflows/release.yml) | Tag `v*`, manual | Verifies tag is on `main`, runs full checks & build, deploys `prod` via Alchemy with version tag, applies migrations, runs smoke test with **automatic rollback on failure**, and creates a GitHub Release |
| [`rollback.yml`](../.github/workflows/rollback.yml) | Manual dispatch | Instant (<5s) Cloudflare Worker version rollback or full Alchemy tag redeploy + smoke verification |
| [`infra-github.yml`](../.github/workflows/infra-github.yml) | Changes to `infra/github.run.ts` | Plans on PRs and reconciles GitHub settings, rulesets, and environments on `main` |
| [`branch-gc.yml`](../.github/workflows/branch-gc.yml) | Weekly Sunday, manual | Cleans up orphaned merged remote branches |
| [`e2e.yml`](../.github/workflows/e2e.yml) | Nightly, manual | Runs Playwright browser E2E checks (`bun run test:e2e`) |

The Rust program (`check:program`, `test:program`) requires the Solana SBF
toolchain and remains a local check for now.

## Cutting a production release & rolling back

Cut a SemVer tag from a clean, up-to-date `main`:

```sh
git switch main && git pull
bun run release:tag v0.2.0 --push
```

This creates an annotated tag `v0.2.0` (verified to match `origin/main`) and
pushes it to GitHub, triggering `.github/workflows/release.yml` in the
`production` environment.

If an issue is spotted after release:
1. Open **GitHub → Actions → Production Rollback → Run workflow**.
2. Keep `mode: instant` (routes 100% traffic back to the previous healthy Worker
   version in seconds) or choose `mode: redeploy-tag` with a previous `vX.Y.Z`.

## Branch & tag protection (IaC)

Repository settings, the `protect-main` branch ruleset, the `protect-release-tags`
tag ruleset (`refs/tags/v*`), and the `preview`/`production` environments are
defined in [`infra/github.run.ts`](../infra/github.run.ts) (keeping
`.github/rulesets/protect-main.json` as a static reference). Dependabot
(`.github/dependabot.yml`) keeps GitHub Actions, Bun dependencies, and Cargo
crates updated weekly with a 7-day release cooldown.
