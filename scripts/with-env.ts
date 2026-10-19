import { parseEnv } from "node:util";

// Bun may have loaded an older .env before secrets:decrypt replaced it. Parse
// the fresh file explicitly so every child gets the newly decrypted values.
const preparation = Bun.spawnSync(["sh", "scripts/secrets.sh", "decrypt"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (preparation.exitCode !== 0) process.exit(preparation.exitCode || 1);

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Usage: bun run scripts/with-env.ts <command> [args...]");
  process.exit(1);
}

const child = Bun.spawn(command, {
  env: { ...process.env, ...parseEnv(await Bun.file(".env").text()) },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.exit(await child.exited);
