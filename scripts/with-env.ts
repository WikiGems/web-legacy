import { Schema } from "effect";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseEnv } from "node:util";

const namespace = "wikigems-dev-bundle";
const bundleKey = "WIKIGEMS_ENV_JSON";
const defaults = {
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
  BETTER_AUTH_SECRET: "",
  BETTER_AUTH_URL: "http://localhost:5173",
  PASSKEY_RP_ID: "localhost",
  PASSKEY_ORIGIN: "http://localhost:5173",
  TRUSTED_ORIGINS: "",
  SOLANA_RPC_URL: "https://api.devnet.solana.com",
  SOLANA_CLUSTER: "devnet",
};
const keys = Object.keys(defaults);
const decodeSettings = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function validate(env: NodeJS.ProcessEnv) {
  if (!env.TURSO_DATABASE_URL?.trim()) fail("Set TURSO_DATABASE_URL with bun run secrets:set. See docs/envchain.md.");
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    fail("Set BETTER_AUTH_SECRET to at least 32 characters. See docs/envchain.md.");
  }
  if (env.TURSO_DATABASE_URL !== "http://127.0.0.1:8080" && !env.TURSO_AUTH_TOKEN?.trim()) {
    fail("Set TURSO_AUTH_TOKEN for the hosted database. See docs/envchain.md.");
  }
}

function save(values: NodeJS.ProcessEnv) {
  validate(values);
  const settings = Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key)));
  const result = Bun.spawnSync(["envchain", "--set", "--require-passphrase", namespace, bundleKey], {
    stdin: Buffer.from(JSON.stringify(settings) + "\n"),
    // Envchain can echo piped input. Keep both streams private.
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) fail("Keychain save failed. Unlock your login keychain and retry. See docs/envchain.md.");
  console.info(`Saved ${Object.keys(settings).length} settings in one protected Keychain item. Your .env was left untouched.`);
}

async function readHidden(name: string) {
  if (!process.stdin.isTTY) fail("Enter new values in an interactive terminal. See docs/envchain.md.");
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: muted, terminal: true, historySize: 0 });
  input.on("SIGINT", () => { input.close(); process.exit(130); });
  process.stdout.write(`New ${name} (input hidden): `);
  try {
    return await input.question("");
  } finally {
    input.close();
    process.stdout.write("\n");
  }
}

async function run(command: string[], env: NodeJS.ProcessEnv): Promise<never> {
  const child = Bun.spawn(command, { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.exit(await child.exited);
}

const [action, ...command] = process.argv.slice(2);
if (!["import", "setup", "set", "check", "run", "exec", "exec-set"].includes(action ?? "")) {
  fail("Usage: bun --no-env-file scripts/with-env.ts import|setup|set <name>|check|run <command> [args...]");
}

if (action === "exec" || action === "exec-set") {
  const raw = process.env[bundleKey];
  delete process.env[bundleKey];
  if (!raw) fail("No settings bundle in Keychain. Run bun run secrets:import or secrets:setup. See docs/envchain.md.");
  let settings;
  try {
    settings = decodeSettings(JSON.parse(raw));
  } catch {
    fail("Invalid settings bundle in Keychain. Run bun run secrets:import or secrets:setup. See docs/envchain.md.");
  }
  // Ignore any names outside this project's supported server settings.
  const values = Object.fromEntries(Object.entries(settings).filter(([key]) => keys.includes(key)));
  if (action === "exec-set") {
    const name = command[0];
    if (!name || !keys.includes(name)) fail("Supply a supported setting name. See .env.example.");
    values[name] = await readHidden(name);
    save(values);
    process.exit(0);
  }
  validate(values);
  if (command.length === 0) {
    console.info("Keychain settings are ready. No secrets were printed.");
    process.exit(0);
  }
  await run(command, { ...process.env, ...defaults, ...values, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true" });
}

if (!Bun.which("envchain")) fail("Install envchain with brew install envchain. See docs/envchain.md.");

if (action === "import") {
  if (!(await Bun.file(".env").exists())) fail("No .env to import. Run bun run secrets:setup. See docs/envchain.md.");
  save(parseEnv(await Bun.file(".env").text()));
  process.exit(0);
}
if (action === "setup") {
  const values: NodeJS.ProcessEnv = {};
  for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "BETTER_AUTH_SECRET"]) {
    values[name] = await readHidden(name);
  }
  save(values);
  process.exit(0);
}
if (action === "run" && command.length === 0) fail("Supply a command after run.");
if (action === "set" && (command.length !== 1 || !keys.includes(command[0] ?? ""))) {
  fail("Supply a supported setting name. See .env.example.");
}

// bun run may inherit an old .env. Only the Keychain bundle can supply settings.
const env = { ...process.env };
for (const key of [...keys, bundleKey]) delete env[key];
await run(["envchain", namespace, process.execPath, "--no-env-file", import.meta.path,
  action === "set" ? "exec-set" : "exec", ...command], env);
