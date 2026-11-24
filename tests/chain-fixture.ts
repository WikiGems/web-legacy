import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import {
  blockhash,
  generateKeyPair,
  getAddressEncoder,
  getAddressFromPublicKey,
  getBase58Decoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  AccountState,
  getMintEncoder,
  getTokenEncoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { createDb } from "../worker/db";
import type { Env } from "../worker/env";
import {
  findConfigPda,
  getConfigEncoder,
  WIKIGEMS_PROGRAM_PROGRAM_ADDRESS,
} from "../worker/chain/generated";
import { fromBase64, toBase64 } from "../worker/chain/signing";
import { CORE_PROGRAM_ADDRESS, usdcAta } from "../worker/chain/transactions";

export const lifetime = {
  blockhash: blockhash("11111111111111111111111111111111"),
  lastValidBlockHeight: 150n,
};

export async function testKey() {
  const keyPair = await generateKeyPair(true);
  return { keyPair, address: await getAddressFromPublicKey(keyPair.publicKey) };
}

export async function migratedDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "wikigems-chain-"));
  const url = `file:${join(directory, "chain.db")}`;
  const client = createClient({ url });
  const db = createDb({ TURSO_DATABASE_URL: url });
  const migrate = async (file: string) => {
    await client.executeMultiple(
      await Bun.file(`migrations/${file}.sql`).text(),
    );
  };
  for (const file of [
    "000_better_auth",
    "001_game",
    "002_account_profiles",
    "003_r2_avatars",
    "004_email_verification",
  ]) {
    await migrate(file);
  }
  async function addUser(
    id: string,
    verified = true,
    wallet: Address | null = null,
  ) {
    await client.execute({
      sql: 'insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, ?, 0, 0)',
      args: [id, id, `${id}@example.com`, Number(verified)],
    });
    if (wallet) {
      await client.execute({
        sql: 'insert into "profiles" ("userId", "walletAddress", "createdAt", "updatedAt") values (?, ?, 0, 0)',
        args: [id, wallet],
      });
    }
  }
  async function addCard(id: string, user: string, createdAt = 1) {
    await client.execute({
      sql: 'insert into "cards" ("id", "articleId", "title", "articleUrl", "rarity", "attack", "defense", "ownerUserId", "createdAt", "forTrade") values (?, ?, ?, ?, ?, 4, 5, ?, ?, 1)',
      args: [
        id,
        `article-${id}`,
        `Card ${id} 💎`,
        "https://en.wikipedia.org/",
        "rare",
        user,
        createdAt,
      ],
    });
  }
  async function close() {
    await db.destroy();
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
  return { url, client, db, addUser, addCard, migrate, close };
}

function wireAccount(owner: string, data: ReadonlyUint8Array) {
  return {
    data: [toBase64(data), "base64"],
    executable: false,
    lamports: 1_000_000,
    owner,
    rentEpoch: 0,
    space: data.length,
  };
}

export async function chainRpcFixture() {
  const [sponsor, mintAuthority, mint, treasury, buyer, seller, other] =
    await Promise.all([
      testKey(),
      testKey(),
      testKey(),
      testKey(),
      testKey(),
      testKey(),
      testKey(),
    ]);
  const [configPda, configBump] = await findConfigPda();
  const treasuryAta = await usdcAta(treasury.address, mint.address);
  const configBytes = getConfigEncoder().encode({
    version: 1,
    admin: sponsor.address,
    pendingAdmin: other.address,
    mintAuthority: mintAuthority.address,
    collection: treasury.address,
    bump: configBump,
    authorityBump: 1,
    collectionBump: 2,
    usdcMint: mint.address,
    treasury: treasuryAta,
    feeBps: 250,
    reserved: new Uint8Array(62),
  });
  const mintBytes = getMintEncoder().encode({
    mintAuthority: null,
    supply: 20_000_000n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: null,
  });

  let height = 100;
  let failBroadcast = false;
  let blockhashValid = true;
  const signedWires = new Map<string, string>();
  const finalized = new Map<string, { wire: string; err: unknown }>();
  const observed = new Set<string>();
  const owners = new Map<string, Address>();
  const balances = new Map<string, ReadonlyUint8Array>();
  const reads: string[][] = [];
  let beforeBroadcast: (() => Promise<void>) | undefined;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const body = (await request.json()) as {
        id: string;
        method: string;
        params?: [unknown, unknown];
      };
      const [first] = body.params ?? [];
      const context = { slot: 100 };
      let result: unknown;
      switch (body.method) {
        case "getGenesisHash":
          result = lifetime.blockhash;
          break;
        case "getAccountInfo":
          result = {
            context,
            value:
              first === configPda
                ? wireAccount(WIKIGEMS_PROGRAM_PROGRAM_ADDRESS, configBytes)
                : first === mint.address
                  ? wireAccount(TOKEN_PROGRAM_ADDRESS, mintBytes)
                  : typeof first === "string" && balances.has(first)
                    ? wireAccount(TOKEN_PROGRAM_ADDRESS, balances.get(first)!)
                    : null,
          };
          break;
        case "getLatestBlockhash":
          result = {
            context,
            value: { ...lifetime, lastValidBlockHeight: 150 },
          };
          break;
        case "getBlockHeight":
          result = height;
          break;
        case "isBlockhashValid":
          result = { context, value: blockhashValid };
          break;
        case "getSignatureStatuses":
          result = {
            context,
            value: Array.isArray(first)
              ? first.map((sig: string) => {
                  if (finalized.has(sig))
                    return {
                      slot: 100,
                      confirmations: null,
                      err: finalized.get(sig)?.err,
                      confirmationStatus: "finalized",
                    };
                  if (observed.has(sig))
                    return {
                      slot: 100,
                      confirmations: 0,
                      err: null,
                      confirmationStatus: "processed",
                    };
                  return null;
                })
              : [],
          };
          break;
        case "getTransaction": {
          const value = typeof first === "string" && finalized.get(first);
          result = value
            ? {
                slot: 100,
                blockTime: 100,
                meta: { err: value.err },
                transaction: [value.wire, "base64"],
                version: "legacy",
              }
            : null;
          break;
        }
        case "sendTransaction": {
          if (typeof first !== "string")
            return new Response(null, { status: 400 });
          const signature = getSignatureFromTransaction(
            getTransactionDecoder().decode(fromBase64(first)),
          );
          signedWires.set(signature, first);
          await beforeBroadcast?.();
          if (failBroadcast) return new Response(null, { status: 502 });
          result = signature;
          break;
        }
        case "getMultipleAccounts":
          if (!Array.isArray(first)) return new Response(null, { status: 400 });
          reads.push(first);
          result = {
            context,
            value: first.map((asset: string) => {
              const owner = owners.get(asset);
              return owner
                ? wireAccount(
                    CORE_PROGRAM_ADDRESS,
                    new Uint8Array([1, ...getAddressEncoder().encode(owner)]),
                  )
                : null;
            }),
          };
          break;
        default:
          return new Response(null, { status: 404 });
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    },
  });

  const asSecret = async (key: typeof sponsor) => {
    const pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", key.keyPair.privateKey),
    );
    const publicKey = getAddressEncoder().encode(key.address);
    return getBase58Decoder().decode(
      new Uint8Array([...pkcs8.slice(-32), ...publicKey]),
    );
  };
  const env = {
    BETTER_AUTH_SECRET: "chain-fixture-passkey-secret-0123456789",
    ASSETS: {
      fetch: async () => new Response(null, { status: 404 }),
      connect: (): never => {
        throw new Error("No sockets");
      },
    },
    AVATARS: {} as R2Bucket,
    SOLANA_CLUSTER: "localnet",
    SOLANA_RPC_URL: server.url.href,
    SPONSOR_SECRET_KEY: await asSecret(sponsor),
    MINT_AUTHORITY_SECRET_KEY: await asSecret(mintAuthority),
    USDC_MINT: mint.address,
    TREASURY_WALLET: treasury.address,
    PUBLIC_ORIGIN: "https://wikigems.example",
  };

  return {
    env,
    sponsor,
    mintAuthority,
    mint,
    treasury,
    buyer,
    seller,
    other,
    signedWires,
    owners,
    reads,
    observed,
    setHeight(value: number) {
      height = value;
    },
    invalidateBlockhash() {
      blockhashValid = false;
    },
    restoreBlockhash() {
      blockhashValid = true;
    },
    failBroadcast(check: () => Promise<void>) {
      failBroadcast = true;
      beforeBroadcast = check;
    },
    finalize(sig: string, options: { wire?: string; err?: unknown } = {}) {
      const wire = options.wire ?? signedWires.get(sig);
      if (!wire) throw new Error("No signed transaction in the test RPC.");
      finalized.set(sig, { wire, err: options.err ?? null });
    },
    async setBalance(owner: Address, amount: bigint) {
      balances.set(
        await usdcAta(owner, mint.address),
        getTokenEncoder().encode({
          mint: mint.address,
          owner,
          amount,
          delegate: null,
          state: AccountState.Initialized,
          isNative: null,
          delegatedAmount: 0n,
          closeAuthority: null,
        }),
      );
    },
    async close() {
      await server.stop(true);
    },
  };
}

export async function chainFixture() {
  const fixture = await migratedDatabase();
  await fixture.migrate("005_lazy_claims");
  const rpc = await chainRpcFixture();
  await fixture.addUser("buyer", true, rpc.buyer.address);
  await fixture.addUser("seller", true, rpc.seller.address);
  await fixture.addUser("other", false, rpc.other.address);
  const env: Env = { ...rpc.env, TURSO_DATABASE_URL: fixture.url };
  return {
    ...fixture,
    ...rpc,
    env,
    async close() {
      await rpc.close();
      await fixture.close();
    },
  };
}
