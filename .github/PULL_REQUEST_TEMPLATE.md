## Summary
<!-- What changed and why? -->

## Verification
- [ ] `bun run check` passes locally
- [ ] `bun run build` and `bun run check:architecture` pass
- [ ] If touching `migrations/`: verified forward-only, backward-compatible (expand-and-contract) with `bun run db:check`
- [ ] If touching `infra/`: reviewed `alchemy plan` output

## Rollback Notes
<!-- Any schema, secret, or config considerations if this release needs to be rolled back? -->
