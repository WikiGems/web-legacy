import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../worker/auth";
import type { Env } from "../worker/env";

const env = {
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080",
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ?? "",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "dev-only-wikigems-secret-change-me-32-chars",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  PASSKEY_RP_ID: process.env.PASSKEY_RP_ID ?? "localhost",
  PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN ?? "http://localhost:5173",
} as Env;

const auth = createAuth(env);
const migration = await getMigrations(auth.options);
const sql = await migration.compileMigrations();

const outPath = existsSync("migrations/000_better_auth.sql")
  ? "migrations/000_better_auth.generated.sql"
  : "migrations/000_better_auth.sql";
await writeFile(outPath, `${sql.trim()}\n`, "utf8");
console.log(`Wrote ${outPath} (${sql.length} bytes)`);
if (outPath.endsWith(".generated.sql")) {
  console.log("The committed auth migration already exists; review the generated file before replacing it.");
}
console.log(`Tables to create: ${migration.toBeCreated.map((table) => table.table).join(", ") || "none"}`);
process.exit(0);
