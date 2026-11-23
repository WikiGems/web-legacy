# Development workflow

`main` is protected. Nothing is committed to it directly: every change arrives
through a pull request that passes CI.

## The loop

```sh
git switch -c <topic>          # branch off main
# ...work, commit...
git push -u origin <topic>     # pre-push hook runs the full check suite
gh pr create                   # CI runs; merge when green
```

Merges are squash or rebase only, so `main` stays linear.

## Checks

| Check  | Tool   | Command                                         |
| ------ | ------ | ----------------------------------------------- |
| Format | oxfmt  | `bun run format:check` (fix: `bun run format`)  |
| Lint   | oxlint | `bun run lint` (fix: `bun run lint:fix`)        |
| Types  | tsc    | `bun run typecheck && bun run check:workspaces` |
| Tests  | vitest | `bun run test` (watch: `bun run test:watch`)    |

`bun run check` runs all of them. Tests import from `vitest`, but run under the Bun
runtime (`bun --bun vitest`) because several use `bun:sqlite` and `Bun.*`.
Always use `bun run test`, not bare `vitest`.

Formatting covers code, JSON and CSS, not Markdown. Config lives in
`.oxfmtrc.json`, `.oxlintrc.json` and `vitest.config.ts`.

## Git hooks (lefthook)

Installed automatically by `bun install`.

- **pre-commit**: formats staged files (and re-stages them), lints them,
  typechecks, and runs only the tests related to the staged files.
- **pre-push**: runs the same checks as CI over the whole repo, and refuses any
  push that targets `main`.

Skip once with `LEFTHOOK=0 git commit ...`. CI re-runs everything, so skipping
only defers the failure.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:
four parallel jobs (format, lint, typecheck, test) and a final `CI` job that
fails unless all of them succeeded. Only `CI` is a required check, so jobs can
be added or renamed without changing repository settings. Actions are pinned to
commit SHAs (Dependabot keeps them current), and the workflow has read-only
permissions.

The Rust program (`check:program`, `test:program`) is not part of CI yet: it
needs the Solana toolchain.

## Branch protection

The rules live in `.github/rulesets/protect-main.json`: pull request required,
the `CI` check required and up to date with `main`, linear history, no force
pushes, no deletion, and no bypass actors. Applying a ruleset needs repository
admin rights:

```sh
gh api -X POST repos/WikiGems/web-legacy/rulesets \
  --input .github/rulesets/protect-main.json
```

To change it later, edit the JSON and `PUT` it to
`repos/WikiGems/web-legacy/rulesets/<id>` (`gh api repos/WikiGems/web-legacy/rulesets`
lists ids). Requiring zero approvals suits a solo maintainer; raise
`required_approving_review_count` when there is a team.
