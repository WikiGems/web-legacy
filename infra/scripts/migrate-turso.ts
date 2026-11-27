import { resolve } from "node:path";
import { runMigrations } from "../../scripts/migrate";
import { resolveStageConfig } from "../src/stage";

/**
 * Applies `migrations/*.sql` against the Turso database owned by an Alchemy stage.
 *
 * Mints a short-lived (10m) Turso auth token via the Turso Platform API using the
 * same `TURSO_API_TOKEN` and `TURSO_ORG` credentials Alchemy already requires, so
 * CI never needs to persist or log a long-lived database credential.
 */
const stageArg =
  process.argv
    .find((arg) => arg.startsWith("--stage="))
    ?.slice("--stage=".length) ?? process.env.ALCHEMY_STAGE;

if (!stageArg) {
  console.error("Missing stage: pass --stage=<stage> or set ALCHEMY_STAGE.");
  process.exit(1);
}

const apiToken = process.env.TURSO_API_TOKEN?.trim();
const org = process.env.TURSO_ORG?.trim();
if (!apiToken || !org) {
  console.error("TURSO_API_TOKEN and TURSO_ORG are required to migrate Turso.");
  process.exit(1);
}

const stage = resolveStageConfig(stageArg);
const apiBase = `https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}/databases/${encodeURIComponent(stage.databaseName)}`;
const headers = { Authorization: `Bearer ${apiToken}` };

const dbResponse = await fetch(apiBase, { headers });
if (!dbResponse.ok) {
  const body = await dbResponse.text();
  throw new Error(
    `Failed to inspect Turso database "${stage.databaseName}" (${dbResponse.status}): ${body}`,
  );
}
const dbPayload = (await dbResponse.json()) as {
  database?: { Hostname?: string };
};
const hostname = dbPayload.database?.Hostname;
if (!hostname) {
  throw new Error(
    `Turso database "${stage.databaseName}" response did not contain a hostname.`,
  );
}

const tokenResponse = await fetch(
  `${apiBase}/auth/tokens?expiration=10m&authorization=full-access`,
  { method: "POST", headers },
);
if (!tokenResponse.ok) {
  const body = await tokenResponse.text();
  throw new Error(
    `Failed to mint ephemeral migration token for "${stage.databaseName}" (${tokenResponse.status}): ${body}`,
  );
}
const tokenPayload = (await tokenResponse.json()) as { jwt?: string };
if (!tokenPayload.jwt) {
  throw new Error("Turso token response did not contain a jwt.");
}

await runMigrations({
  url: `libsql://${hostname}`,
  authToken: tokenPayload.jwt,
  migrationsDir: resolve(import.meta.dir, "../../migrations"),
});
