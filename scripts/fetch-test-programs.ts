// Downloads the on-chain programs that the Solana program tests execute in LiteSVM.
// Binaries are not committed; each is pinned by SHA-256 so a silent upstream
// upgrade fails loudly instead of changing test behaviour.
//
//   bun scripts/fetch-test-programs.ts           verify or download
//   bun scripts/fetch-test-programs.ts --update  print new hashes after an upstream upgrade

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const RPC_URL =
  process.env.SOLANA_FIXTURE_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const OUT_DIR = join(
  import.meta.dir,
  "..",
  "programs",
  "wikigems",
  "tests",
  "fixtures",
);

const PROGRAMS = [
  {
    name: "mpl_core",
    programId: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
    sha256: "51d41542456639a01820c747e72b9d3b4ca258930a5bbb7e78db0cda133dc209",
  },
] as const;

// UpgradeableLoaderState::ProgramData header: u32 tag + u64 slot + Option<Pubkey>.
const PROGRAM_DATA_HEADER = 4 + 8 + 1 + 32;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const payload = (await response.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (payload.error || payload.result === undefined) {
    throw new Error(`${method}: ${payload.error?.message ?? "empty result"}`);
  }
  return payload.result;
}

async function download(programId: string): Promise<Uint8Array> {
  const program = await rpc<{
    value: { data: { parsed: { info: { programData: string } } } } | null;
  }>("getAccountInfo", [programId, { encoding: "jsonParsed" }]);
  const programData = program.value?.data.parsed.info.programData;
  if (!programData)
    throw new Error(`${programId} is not an upgradeable program`);
  const account = await rpc<{ value: { data: [string, "base64"] } | null }>(
    "getAccountInfo",
    [programData, { encoding: "base64" }],
  );
  if (!account.value) throw new Error(`missing program data for ${programId}`);
  return Buffer.from(account.value.data[0], "base64").subarray(
    PROGRAM_DATA_HEADER,
  );
}

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const update = process.argv.includes("--update");

await mkdir(OUT_DIR, { recursive: true });
for (const program of PROGRAMS) {
  const path = join(OUT_DIR, `${program.name}.so`);
  const existing = await readFile(path).catch(() => null);
  if (existing && sha256(existing) === program.sha256) {
    console.log(`${program.name}: ok`);
    continue;
  }
  const bytes = await download(program.programId);
  const hash = sha256(bytes);
  if (hash !== program.sha256 && !update) {
    throw new Error(
      `${program.name}: downloaded hash ${hash} does not match the pinned ${program.sha256}. ` +
        "Review the upstream upgrade, then rerun with --update and pin the new hash.",
    );
  }
  await writeFile(path, bytes);
  console.log(`${program.name}: ${bytes.length} bytes, sha256 ${hash}`);
}
