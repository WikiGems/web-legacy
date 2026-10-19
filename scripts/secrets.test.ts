import { afterEach, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "wikigems-secrets-"));
  fixtures.push(directory);
  mkdirSync(join(directory, "scripts"));
  copyFileSync("scripts/secrets.sh", join(directory, "scripts/secrets.sh"));
  copyFileSync("scripts/with-env.ts", join(directory, "scripts/with-env.ts"));
  const keyFile = join(directory, "key.txt");
  const env = { PATH: process.env.PATH!, HOME: directory, SOPS_AGE_KEY_FILE: keyFile };
  function run(command: string[], extraEnv: Record<string, string> = {}) {
    return Bun.spawnSync(command, {
      cwd: directory,
      env: { ...env, ...extraEnv },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    });
  }
  expect(run(["age-keygen", "-o", keyFile]).exitCode).toBe(0);
  const publicKey = run(["age-keygen", "-y", keyFile]).stdout.toString().trim();
  writeFileSync(join(directory, ".sops.yaml"), `creation_rules:\n  - path_regex: ^secrets/development\\.env$\n    age: ${publicKey}\n`);
  const plaintext = 'TURSO_AUTH_TOKEN="test-token"\nBETTER_AUTH_SECRET="test-secret-with-quotes-and-spaces"\n';
  writeFileSync(join(directory, ".env"), plaintext, { mode: 0o600 });
  expect(run(["sh", "scripts/secrets.sh", "encrypt"]).exitCode).toBe(0);
  return { directory, run, plaintext };
}

test("encrypts values and restores an identical private environment file", () => {
  const { directory, run, plaintext } = fixture();
  const ciphertext = readFileSync(join(directory, "secrets/development.env"), "utf8");
  expect(ciphertext).toContain("ENC[AES256_GCM,");
  expect(ciphertext).not.toContain("test-token");
  expect(ciphertext).not.toContain("test-secret-with-quotes-and-spaces");
  rmSync(join(directory, ".env"));
  expect(run(["sh", "scripts/secrets.sh", "decrypt"]).exitCode).toBe(0);
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(plaintext);
  expect(statSync(join(directory, ".env")).mode & 0o777).toBe(0o600);
});

test("an unauthorized key stops the command and preserves the last environment", () => {
  const { directory, run, plaintext } = fixture();
  const otherKey = join(directory, "other-key.txt");
  expect(run(["age-keygen", "-o", otherKey]).exitCode).toBe(0);
  const result = run([process.execPath, "run", "scripts/with-env.ts", process.execPath, "-e", 'console.log("CHILD_RAN")'], {
    SOPS_AGE_KEY_FILE: otherKey,
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout.toString()).not.toContain("CHILD_RAN");
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(plaintext);
});

test("the command receives decrypted values even when Bun inherited stale secrets", () => {
  const { run } = fixture();
  const result = run([process.execPath, "run", "scripts/with-env.ts", process.execPath, "-e", 'if (process.env.TURSO_AUTH_TOKEN !== "test-token") process.exit(1)'], {
    TURSO_AUTH_TOKEN: "stale-token",
  });
  expect(result.exitCode).toBe(0);
});

test("accepts a sops-nix provisioned file without decrypting the repository source", () => {
  const { directory, run } = fixture();
  const managedFile = join(directory, "managed.env");
  writeFileSync(managedFile, 'TURSO_AUTH_TOKEN="managed-token"\n');
  rmSync(join(directory, "secrets/development.env"));
  const result = run([process.execPath, "run", "scripts/with-env.ts", process.execPath, "-e", 'if (process.env.TURSO_AUTH_TOKEN !== "managed-token") process.exit(1)'], {
    WIKIGEMS_ENV_FILE: managedFile,
  });
  expect(result.exitCode).toBe(0);
  expect(statSync(join(directory, ".env")).mode & 0o777).toBe(0o600);
});

test("rejects a Worker override that would split migration and runtime credentials", () => {
  const { directory, run, plaintext } = fixture();
  writeFileSync(join(directory, ".dev.vars"), "TURSO_AUTH_TOKEN=stale-worker-token\n");
  expect(run(["sh", "scripts/secrets.sh", "decrypt"]).exitCode).not.toBe(0);
  expect(readFileSync(join(directory, ".env"), "utf8")).toBe(plaintext);
});
