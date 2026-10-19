/**
 * One-command local development:
 *   1. use the configured Turso database, or start a local libSQL server
 *   2. apply migrations
 *   3. compile the static frontend once so Wrangler has an assets directory
 *   4. start the Worker on :8787 and Vite on :5173
 *
 * Vite proxies /api to the Worker, so cookies and WebAuthn stay same-origin.
 */
import { existsSync, mkdirSync } from "node:fs";

const children: Bun.Subprocess[] = [];
let shuttingDown = false;

function start(command: string[], label: string) {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  children.push(child);
  child.exited.then((code) => {
    if (!shuttingDown) {
      console.error(`\n[${label}] exited with code ${code}`);
      shutdown(code || 1);
    }
  });
  return child;
}

async function healthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await healthy(url)) return;
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(code), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  const databaseURL = process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080";
  process.env.TURSO_DATABASE_URL = databaseURL;

  if (databaseURL !== "http://127.0.0.1:8080") {
    console.log(`→ using configured database: ${databaseURL}`);
  } else if (await healthy("http://127.0.0.1:8080/health")) {
    console.log("→ local Turso already running");
  } else {
    console.log("→ starting local Turso on :8080");
    mkdirSync(".data", { recursive: true });
    start(["turso", "dev", "--db-file", ".data/wikigems.db", "--port", "8080"], "turso");
    await waitFor("http://127.0.0.1:8080/health", "local Turso");
  }

  console.log("→ applying database migrations");
  const migration = Bun.spawn(["bun", "run", "scripts/migrate.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  const migrationCode = await migration.exited;
  if (migrationCode !== 0) throw new Error("Database migration failed.");

  if (!existsSync("dist/client/index.html")) {
    console.log("→ building the frontend for Wrangler assets");
    const build = Bun.spawn(["bun", "run", "build"], {
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env },
    });
    if ((await build.exited) !== 0) throw new Error("Frontend build failed.");
  }

  console.log("→ starting Worker on :8787");
  start(["wrangler", "dev", "--port", "8787"], "wrangler");
  await waitFor("http://127.0.0.1:8787/api/health", "Worker");

  console.log("→ starting Vite on :5173");
  start(["vite", "--port", "5173"], "vite");

  console.log("\n  WikiGems is live at http://localhost:5173");
  console.log("  Use localhost (not 127.0.0.1) so WebAuthn can bind to the rpID.\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
