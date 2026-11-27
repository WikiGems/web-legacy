import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "./migrate";

/**
 * Verifies every SQL file in `migrations/` applies cleanly from scratch on an
 * ephemeral SQLite database and is idempotent when re-run.
 */
const dir = mkdtempSync(join(tmpdir(), "wikigems-migrations-check-"));
const dbPath = join(dir, "check.db");
const url = `file:${dbPath}`;

try {
  const first = await runMigrations({ url });
  if (first.applied.length === 0) {
    throw new Error("Expected at least one migration to be applied.");
  }

  const second = await runMigrations({ url, quiet: true });
  if (second.applied.length !== 0) {
    throw new Error(
      `Migrations are not idempotent; re-applied: ${second.applied.join(", ")}`,
    );
  }
  console.log(
    `Migration check passed: ${first.applied.length} migration(s) applied cleanly and verified idempotent.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
