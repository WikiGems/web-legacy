import { afterEach, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const settings = {
  TURSO_DATABASE_URL: "libsql://example.invalid",
  TURSO_AUTH_TOKEN: "keychain-token",
  BETTER_AUTH_SECRET: "a-test-secret-that-is-at-least-32-characters",
};

function fixture(stored: Record<string, string> = settings) {
  const directory = mkdtempSync(join(tmpdir(), "wikigems-envchain-"));
  fixtures.push(directory);
  mkdirSync(join(directory, "scripts"));
  mkdirSync(join(directory, "bin"));
  copyFileSync("scripts/with-env.ts", join(directory, "scripts/with-env.ts"));
  symlinkSync(resolve("node_modules"), join(directory, "node_modules"));
  const store = join(directory, "keychain.json");
  const operations = join(directory, "operations.jsonl");
  writeFileSync(store, JSON.stringify(Object.keys(stored).length ? { WIKIGEMS_ENV_JSON: JSON.stringify(stored) } : {}));
  // Replace only the OS vault boundary; run the real launcher and child processes.
  writeFileSync(join(directory, "bin/envchain"), `#!${process.execPath} --no-env-file
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (process.env.DENY_KEYCHAIN) process.exit(9);
if (args[0] === '--set') {
  if (args.length !== 4 || args[1] !== '--require-passphrase' || args[2] !== 'wikigems-dev-bundle' || args[3] !== 'WIKIGEMS_ENV_JSON') process.exit(2);
  const value = (await Bun.stdin.text()).trimEnd();
  appendFileSync(process.env.TEST_OPERATIONS, JSON.stringify({ operation: 'save', itemCount: 1, requirePassphrase: true }) + '\\n');
  await Bun.write(process.env.TEST_STORE, JSON.stringify({ WIKIGEMS_ENV_JSON: value }));
  console.log(value);
  console.error(value);
} else {
  if (args[0] !== 'wikigems-dev-bundle') process.exit(2);
  appendFileSync(process.env.TEST_OPERATIONS, JSON.stringify({ operation: 'read', itemCount: 1 }) + '\\n');
  const stored = await Bun.file(process.env.TEST_STORE).json();
  const child = Bun.spawn(args.slice(1), {
    env: { ...process.env, ...stored }, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
  });
  process.exit(await child.exited);
}
`, { mode: 0o700 });
  function run(args: string[], extraEnv: Record<string, string> = {}) {
    return Bun.spawnSync([process.execPath, "--no-env-file", "scripts/with-env.ts", ...args], {
      cwd: directory,
      env: {
        PATH: join(directory, "bin") + delimiter + (process.env.PATH ?? ""),
        HOME: directory,
        TEST_STORE: store,
        TEST_OPERATIONS: operations,
        ...extraEnv,
      },
      stdout: "pipe", stderr: "pipe", timeout: 15000,
    });
  }
  return { directory, store, operations, run };
}

const child = (code: string) => ["run", process.execPath, "--no-env-file", "-e", code];

test("uses Keychain values despite inherited stale credentials and leaves plaintext untouched", () => {
  const { directory, run } = fixture();
  const plaintext = 'TURSO_AUTH_TOKEN="old-file-token"\n';
  writeFileSync(join(directory, ".env"), plaintext);
  const result = run(child('if (process.env.TURSO_AUTH_TOKEN !== "keychain-token") process.exit(1)'), {
    TURSO_AUTH_TOKEN: "stale-inherited-token",
  });
  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(plaintext);
});

test("a missing namespace cannot fall back to inherited or file credentials", () => {
  const { directory, run } = fixture({});
  writeFileSync(join(directory, ".env"), Object.entries(settings).map(([key, value]) => `${key}=${value}`).join("\n"));
  const result = run(child('console.log("CHILD_RAN")'), settings);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("No settings bundle");
  expect(result.stdout.toString()).not.toContain("CHILD_RAN");
});

test("checks stored settings without printing them or creating an env file", () => {
  const { directory, run } = fixture();
  const result = run(["check"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain("Keychain settings are ready");
  expect(result.stdout.toString()).not.toContain(settings.TURSO_AUTH_TOKEN);
  expect(existsSync(join(directory, ".env"))).toBe(false);
});

test("denied Keychain access stops the command", () => {
  const { run } = fixture();
  const result = run(child('console.log("CHILD_RAN")'), { DENY_KEYCHAIN: "1" });
  expect(result.exitCode).toBe(9);
  expect(result.stdout.toString()).not.toContain("CHILD_RAN");
});

test("rejects a missing hosted token even when the parent has one", () => {
  const { TURSO_AUTH_TOKEN: _, ...withoutToken } = settings;
  const { run } = fixture(withoutToken);
  const result = run(["check"], { TURSO_AUTH_TOKEN: "stale-token" });
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("TURSO_AUTH_TOKEN");
});

test("allows an empty token for the local database", () => {
  const { run } = fixture({ ...settings, TURSO_DATABASE_URL: "http://127.0.0.1:8080", TURSO_AUTH_TOKEN: "" });
  expect(run(["check"]).exitCode).toBe(0);
});

test("imports through stdin without echoing secrets or changing plaintext", () => {
  const { directory, store, run } = fixture({});
  const token = 'token with spaces $dollar "quotes" and = signs';
  const plaintext = `TURSO_DATABASE_URL=${settings.TURSO_DATABASE_URL}\nTURSO_AUTH_TOKEN='${token}'\nBETTER_AUTH_SECRET=${settings.BETTER_AUTH_SECRET}\n`;
  writeFileSync(join(directory, ".env"), plaintext, { mode: 0o600 });
  const result = run(["import"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).not.toContain(token);
  expect(result.stderr.toString()).not.toContain(token);
  const entries = JSON.parse(readFileSync(store, "utf8"));
  expect(Object.keys(entries)).toEqual(["WIKIGEMS_ENV_JSON"]);
  expect(JSON.parse(entries.WIKIGEMS_ENV_JSON)).toEqual({ ...settings, TURSO_AUTH_TOKEN: token });
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(plaintext);
});

test("passes command arguments and exit status through unchanged", () => {
  const { run } = fixture();
  const result = run([...child('if (process.argv[1] !== "two words") process.exit(1); process.exit(7)'), "two words"]);
  expect(result.exitCode).toBe(7);
});

test("stores multiline values inside a single protected JSON item", () => {
  const { directory, store, operations, run } = fixture();
  writeFileSync(join(directory, ".env"), `TURSO_DATABASE_URL=${settings.TURSO_DATABASE_URL}\nTURSO_AUTH_TOKEN="line one\nline two"\nBETTER_AUTH_SECRET=${settings.BETTER_AUTH_SECRET}\n`);
  const result = run(["import"]);
  expect(result.exitCode).toBe(0);
  const entries = JSON.parse(readFileSync(store, "utf8"));
  expect(Object.keys(entries)).toEqual(["WIKIGEMS_ENV_JSON"]);
  expect(JSON.parse(entries.WIKIGEMS_ENV_JSON).TURSO_AUTH_TOKEN).toBe("line one\nline two");
  expect(JSON.parse(readFileSync(operations, "utf8"))).toEqual({ operation: "save", itemCount: 1, requirePassphrase: true });
});

test("each launch reads the bundle once and does not pass the bundle to the service", () => {
  const { operations, run } = fixture();
  const result = run(child('if (process.env.WIKIGEMS_ENV_JSON !== undefined || process.env.TURSO_AUTH_TOKEN !== "keychain-token") process.exit(1)'));
  expect(result.exitCode).toBe(0);
  expect(readFileSync(operations, "utf8").trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(readFileSync(operations, "utf8"))).toEqual({ operation: "read", itemCount: 1 });
});

test("rejects malformed or non-string bundles without printing their contents", () => {
  const { store, run } = fixture();
  for (const value of ['{"token":"private-value",', '{"TURSO_DATABASE_URL":123,"token":"private-value"}']) {
    writeFileSync(store, JSON.stringify({ WIKIGEMS_ENV_JSON: value }));
    const result = run(["check"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Invalid settings bundle");
    expect(result.stderr.toString()).not.toContain("private-value");
  }
});

test("ignores an inherited bundle and rejects unsupported setting names before reading Keychain", () => {
  const { operations, run } = fixture({});
  expect(run(["check"], { WIKIGEMS_ENV_JSON: JSON.stringify(settings) }).exitCode).not.toBe(0);
  const before = readFileSync(operations, "utf8");
  expect(run(["set", "UNSUPPORTED"]).exitCode).not.toBe(0);
  expect(readFileSync(operations, "utf8")).toBe(before);
});
