import { Schema } from "effect";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { Kysely } from "kysely";
import { WalletLinkSchema } from "../shared/domain";
import {
  AddVaultWrapperSchema,
  CreateVaultSchema,
  CredentialIdSchema,
  MAX_WALLET_WRAPPERS,
  VaultProofSchema,
  WalletAddressSchema,
  WalletSignatureSchema,
  type VaultProofPurpose,
  type WalletVaultStatus,
  type WalletWrapper,
} from "../shared/wallet-vault";
import type { WikiGemsAuth } from "./auth";
import type { Database, ProfileTable } from "./db";
import type { Env } from "./env";

type Db = Kysely<Database>;
type User = { id: string; email: string };
type Purpose = VaultProofPurpose | "link";
type EnsureProfile = (db: Db, userId: string) => Promise<ProfileTable>;

const vaultPath = "/api/wallet/vault";
const wrapperPath = `${vaultPath}/wrappers`;
const maxBodyBytes = 4096;
const exactBody = { onExcessProperty: "error" } as const;

class WalletHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const privateJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function readBody<T>(
  request: Request,
  parse: (input: unknown) => T,
): Promise<T> {
  if (
    !request.body ||
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new WalletHttpError(400, "Expected a JSON wallet request.");
  if (Number(request.headers.get("content-length")) > maxBodyBytes)
    throw new WalletHttpError(413, "The wallet request is too large.");

  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBodyBytes);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > bytes.length) {
        await reader.cancel();
        throw new WalletHttpError(413, "The wallet request is too large.");
      }
      bytes.set(value, length);
      length += value.length;
    }
    return parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, length),
        ),
      ),
    );
  } catch (error) {
    if (error instanceof WalletHttpError) throw error;
    throw new WalletHttpError(400, "The wallet request is invalid.");
  } finally {
    reader.releaseLock();
  }
}

function isWalletAddress(value: unknown): value is string {
  return (
    Schema.is(WalletAddressSchema)(value) && bs58.decode(value).length === 32
  );
}

function challengePurpose(url: URL): Purpose {
  const value = url.searchParams.get("purpose");
  if (value === null) return "link";
  if (value === "create" || value === "add-wrapper" || value === "export")
    return value;
  throw new WalletHttpError(400, "The wallet challenge purpose is invalid.");
}

function challengeMessage(
  user: User,
  address: string,
  nonce: string,
  purpose: Purpose,
) {
  const action = purpose === "link" ? "link" : `vault ${purpose}`;
  return `WikiGems wallet ${action}\nAccount: ${user.email}\nWallet: ${address}\nNonce: ${nonce}`;
}

async function issueChallenge(
  db: Db,
  ensureProfile: EnsureProfile,
  user: User,
  url: URL,
  purpose: Purpose,
) {
  const address = url.searchParams.get("wallet");
  if (!isWalletAddress(address))
    throw new WalletHttpError(400, "That wallet address is invalid.");

  const profile = await ensureProfile(db, user.id);
  const now = Date.now();
  const nonce =
    purpose === "link"
      ? crypto.randomUUID()
      : `${purpose}:${crypto.randomUUID()}`;
  const expiresAt = now + 5 * 60_000;
  await db
    .updateTable("profiles")
    .set({
      walletNonce: nonce,
      walletNonceExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where("userId", "=", user.id)
    .execute();
  return privateJson({
    message: challengeMessage(user, address, nonce, purpose),
    nonce,
    expiresAt,
    previousWallet: profile.walletAddress,
  });
}

function verifyProof(
  profile: ProfileTable,
  user: User,
  address: string,
  signature: string,
  purpose: Purpose,
) {
  const { walletNonce, walletNonceExpiresAt } = profile;
  if (
    !walletNonce ||
    !walletNonceExpiresAt ||
    walletNonceExpiresAt <= Date.now()
  )
    throw new WalletHttpError(
      400,
      "The wallet challenge expired. Try again.",
      "CHALLENGE_EXPIRED",
    );
  const matchesPurpose =
    purpose === "link"
      ? !walletNonce.includes(":")
      : walletNonce.startsWith(`${purpose}:`);
  if (!matchesPurpose)
    throw new WalletHttpError(
      400,
      "Request a new wallet challenge and try again.",
      "CHALLENGE_EXPIRED",
    );

  let valid = false;
  if (isWalletAddress(address) && Schema.is(WalletSignatureSchema)(signature)) {
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    valid = ed25519.verify(
      bytes,
      new TextEncoder().encode(
        challengeMessage(user, address, walletNonce, purpose),
      ),
      bs58.decode(address),
      { zip215: false },
    );
  }
  if (!valid)
    throw new WalletHttpError(
      400,
      "That wallet signature is not valid.",
      "BAD_SIGNATURE",
    );
}

async function consumeProof(
  db: Db,
  profile: ProfileTable,
  address: string | null,
) {
  const now = Date.now();
  const result = await db
    .updateTable("profiles")
    .set({
      walletAddress: address,
      walletNonce: null,
      walletNonceExpiresAt: null,
      updatedAt: now,
    })
    .where("userId", "=", profile.userId)
    .where("walletAddress", "is", profile.walletAddress)
    .where("walletNonce", "=", profile.walletNonce)
    .where("walletNonceExpiresAt", ">", now)
    .executeTakeFirst();
  if (result.numUpdatedRows !== 1n)
    throw new WalletHttpError(
      409,
      "Your wallet changed. Request a new challenge and try again.",
    );
}

async function readVault(
  db: Db,
  userId: string,
  rpId: string,
): Promise<WalletVaultStatus> {
  const rows = await db
    .selectFrom("user")
    .leftJoin("profiles as p", "p.userId", "user.id")
    .leftJoin("wallet_vaults as v", "v.userId", "user.id")
    .leftJoin("wallet_vault_wrappers as w", "w.userId", "v.userId")
    .select([
      "p.walletAddress",
      "v.publicKey",
      "v.prfSalt",
      "v.exportedAt",
      "w.credentialId",
      "w.version",
      "w.iv",
      "w.ciphertext",
      "w.createdAt",
    ])
    .where("user.id", "=", userId)
    .orderBy("w.createdAt")
    .execute();
  const first = rows[0];
  const walletAddress = first?.walletAddress ?? null;
  if (!first?.publicKey) return { userId, rpId, walletAddress, vault: null };

  const { publicKey, exportedAt } = first;
  const wrappers = rows.flatMap(
    ({ credentialId, version, prfSalt, iv, ciphertext, createdAt }) =>
      credentialId &&
      version &&
      prfSalt &&
      iv &&
      ciphertext &&
      createdAt !== null
        ? [
            {
              credentialId,
              version,
              prfSalt,
              iv,
              ciphertext,
              createdAt,
              publicKey,
            },
          ]
        : [],
  );
  return {
    userId,
    rpId,
    walletAddress,
    vault: { publicKey, exportedAt, wrappers },
  };
}

async function insertWrapper(db: Db, userId: string, wrapper: WalletWrapper) {
  const { version, credentialId, iv, ciphertext } = wrapper;
  const result = await db
    .insertInto("wallet_vault_wrappers")
    .values({
      userId,
      version,
      credentialId,
      iv,
      ciphertext,
      createdAt: Date.now(),
    })
    .onConflict((conflict) =>
      conflict.columns(["userId", "credentialId"]).doNothing(),
    )
    .executeTakeFirst();
  if (result.numInsertedOrUpdatedRows !== 1n)
    throw new WalletHttpError(
      409,
      "This passkey is already saved for your wallet.",
    );
}

async function removeWrapper(db: Db, userId: string, credentialId: string) {
  const removed = await db
    .deleteFrom("wallet_vault_wrappers as target")
    .where("target.userId", "=", userId)
    .where("target.credentialId", "=", credentialId)
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("wallet_vaults as v")
            .select("v.userId")
            .whereRef("v.userId", "=", "target.userId")
            .where("v.exportedAt", "is not", null),
        ),
        eb.exists(
          eb
            .selectFrom("wallet_vault_wrappers as other")
            .select("other.credentialId")
            .whereRef("other.userId", "=", "target.userId")
            .whereRef("other.credentialId", "!=", "target.credentialId"),
        ),
      ]),
    )
    .returning("credentialId")
    .executeTakeFirst();
  if (removed) return privateJson(removed);

  const existing = await db
    .selectFrom("wallet_vault_wrappers")
    .select("credentialId")
    .where("userId", "=", userId)
    .where("credentialId", "=", credentialId)
    .executeTakeFirst();
  if (!existing)
    throw new WalletHttpError(404, "That wallet passkey was not found.");
  throw new WalletHttpError(
    409,
    "Add another passkey or export your private key before removing your last passkey.",
  );
}

async function updateWithProof(
  request: Request,
  db: Db,
  user: User,
  ensureProfile: EnsureProfile,
  purpose: Purpose,
) {
  if (purpose === "link") {
    const body = await readBody(
      request,
      Schema.decodeUnknownSync(WalletLinkSchema),
    );
    const profile = await ensureProfile(db, user.id);
    verifyProof(profile, user, body.walletAddress, body.signature, purpose);
    await db.transaction().execute(async (tx) => {
      await consumeProof(tx, profile, body.walletAddress);
      const vault = await tx
        .selectFrom("wallet_vaults")
        .select("publicKey")
        .where("userId", "=", user.id)
        .executeTakeFirst();
      if (vault && vault.publicKey !== body.walletAddress)
        throw new WalletHttpError(
          409,
          "Connect the wallet that matches your saved wallet address.",
        );
    });
    return privateJson({ walletAddress: body.walletAddress });
  }

  if (purpose === "create") {
    const body = await readBody(
      request,
      Schema.decodeUnknownSync(CreateVaultSchema, exactBody),
    );
    if (
      body.replaceExternalAddress &&
      !isWalletAddress(body.replaceExternalAddress)
    )
      throw new WalletHttpError(
        400,
        "That replacement wallet address is invalid.",
      );
    const profile = await ensureProfile(db, user.id);
    verifyProof(profile, user, body.publicKey, body.signature, purpose);
    if (
      profile.walletAddress &&
      profile.walletAddress !== body.publicKey &&
      profile.walletAddress !== body.replaceExternalAddress
    )
      throw new WalletHttpError(
        409,
        "Confirm that you want to replace your linked wallet.",
        "REPLACE_EXTERNAL",
      );

    await db.transaction().execute(async (tx) => {
      await consumeProof(tx, profile, body.publicKey);
      const result = await tx
        .insertInto("wallet_vaults")
        .values({
          userId: user.id,
          publicKey: body.publicKey,
          prfSalt: body.prfSalt,
          exportedAt: null,
        })
        .onConflict((conflict) => conflict.column("userId").doNothing())
        .executeTakeFirst();
      if (result.numInsertedOrUpdatedRows !== 1n)
        throw new WalletHttpError(
          409,
          "You already have a saved wallet. Reload and unlock it.",
        );
      await insertWrapper(tx, user.id, body);
    });
    return privateJson({ walletAddress: body.publicKey }, 201);
  }

  const body =
    purpose === "add-wrapper"
      ? {
          kind: "wrapper" as const,
          data: await readBody(
            request,
            Schema.decodeUnknownSync(AddVaultWrapperSchema, exactBody),
          ),
        }
      : {
          kind: "export" as const,
          data: await readBody(
            request,
            Schema.decodeUnknownSync(VaultProofSchema, exactBody),
          ),
        };
  const profile = await ensureProfile(db, user.id);
  verifyProof(profile, user, body.data.publicKey, body.data.signature, purpose);
  return db.transaction().execute(async (tx) => {
    await consumeProof(tx, profile, profile.walletAddress);
    const vault = await tx
      .selectFrom("wallet_vaults")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();
    if (
      !vault ||
      vault.publicKey !== body.data.publicKey ||
      profile.walletAddress !== vault.publicKey
    )
      throw new WalletHttpError(
        409,
        "That address does not match your saved wallet.",
      );
    if (body.kind === "export") {
      const exportedAt = vault.exportedAt ?? Date.now();
      await tx
        .updateTable("wallet_vaults")
        .set({ exportedAt })
        .where("userId", "=", user.id)
        .execute();
      return privateJson({ exportedAt });
    }

    const { count } = await tx
      .selectFrom("wallet_vault_wrappers")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("userId", "=", user.id)
      .executeTakeFirstOrThrow();
    if (count >= MAX_WALLET_WRAPPERS)
      throw new WalletHttpError(
        409,
        "Remove a wallet passkey before adding another.",
      );
    if (body.data.prfSalt !== vault.prfSalt)
      throw new WalletHttpError(
        400,
        "The passkey does not use this wallet's protection settings.",
      );
    await insertWrapper(tx, user.id, body.data);
    return privateJson({ credentialId: body.data.credentialId }, 201);
  });
}

export async function handleWallet(
  request: Request,
  env: Env,
  auth: WikiGemsAuth,
  db: Db,
  ensureProfile: EnsureProfile,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new WalletHttpError(
        403,
        "This wallet request came from another site.",
      );

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      throw new WalletHttpError(
        401,
        "Sign in to use your wallet.",
        "UNAUTHORIZED",
      );
    const user = session.user;

    const purpose =
      path === "/api/wallet/challenge" ? challengePurpose(url) : "link";
    if (
      (path.startsWith(vaultPath) && request.method !== "GET") ||
      purpose !== "link"
    ) {
      // Browsers omit Origin on same-origin GETs. The account header still guards challenges.
      if (request.method !== "GET" && origin !== url.origin)
        throw new WalletHttpError(
          403,
          "This wallet request needs a trusted origin.",
        );
      if (request.headers.get("x-wikigems-account") !== user.id)
        throw new WalletHttpError(
          409,
          "Your active account changed. Open Wallet again.",
        );
    }

    if (path === "/api/wallet/challenge" && request.method === "GET")
      return await issueChallenge(db, ensureProfile, user, url, purpose);
    if (path === "/api/wallet/link" && request.method === "POST")
      return await updateWithProof(request, db, user, ensureProfile, "link");

    if (path === vaultPath && request.method === "GET") {
      const rpId =
        env.PASSKEY_RP_ID ||
        new URL(env.BETTER_AUTH_URL || url.origin).hostname;
      return privateJson(await readVault(db, user.id, rpId));
    }
    if (request.method === "POST") {
      if (path === vaultPath)
        return await updateWithProof(
          request,
          db,
          user,
          ensureProfile,
          "create",
        );
      if (path === wrapperPath)
        return await updateWithProof(
          request,
          db,
          user,
          ensureProfile,
          "add-wrapper",
        );
      if (path === `${vaultPath}/exported`)
        return await updateWithProof(
          request,
          db,
          user,
          ensureProfile,
          "export",
        );
    }
    if (path.startsWith(`${wrapperPath}/`) && request.method === "DELETE") {
      const id = path.slice(wrapperPath.length + 1);
      if (!Schema.is(CredentialIdSchema)(id))
        throw new WalletHttpError(404, "That wallet passkey was not found.");
      return await removeWrapper(db, user.id, id);
    }
    throw new WalletHttpError(404, "Wallet request not found.");
  } catch (error) {
    if (error instanceof WalletHttpError)
      return privateJson(
        { error: error.message, code: error.code },
        error.status,
      );
    // Database errors may contain SQL parameters. Never log wallet request data.
    return privateJson(
      { error: "The wallet service is unavailable. Try again." },
      503,
    );
  }
}
