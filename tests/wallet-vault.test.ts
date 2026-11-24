import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { Schema } from "effect";
import { accountFixture } from "./account-fixture";
import { WalletChallengeSchema } from "../shared/domain";
import {
  encodeBase64Url,
  WalletVaultStatusSchema,
  type VaultProofPurpose,
} from "../shared/wallet-vault";
import { handleApi } from "../worker/api";

const root = "/api/wallet";
const vault = `${root}/vault`;
const wrappers = `${vault}/wrappers`;
const key = (byte: number) => {
  const seed = new Uint8Array(32).fill(byte);
  const publicKey = bs58.encode(ed25519.getPublicKey(seed));
  const sign = (message: string) =>
    Buffer.from(ed25519.sign(new TextEncoder().encode(message), seed)).toString(
      "base64",
    );
  return { publicKey, sign };
};
const first = key(42);
const second = key(43);
const wrapper = {
  version: 1,
  credentialId: "AQ",
  prfSalt: encodeBase64Url(new Uint8Array(32)),
  iv: encodeBase64Url(new Uint8Array(12)),
  ciphertext: encodeBase64Url(new Uint8Array(48)),
  publicKey: first.publicKey,
};

let fixture: Awaited<ReturnType<typeof accountFixture>>;
let alice: Awaited<ReturnType<typeof fixture.addUser>>;
let bob: typeof alice;

beforeEach(async () => {
  fixture = await accountFixture();
  alice = await fixture.addUser("Alice");
  bob = await fixture.addUser("Bob");
});

afterEach(async () => {
  await fixture.cleanup();
});

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function challenge(
  signer: typeof first,
  purpose?: VaultProofPurpose,
  cookie = alice.cookie,
  credentialId?: string,
) {
  const query = new URLSearchParams({ wallet: signer.publicKey });
  if (purpose) query.set("purpose", purpose);
  if (credentialId) query.set("credentialId", credentialId);
  const response = await fixture.request(`${root}/challenge?${query}`, cookie, {
    method: "POST",
  });
  expect(response.status).toBe(200);
  const { message } = Schema.decodeUnknownSync(WalletChallengeSchema)(
    await response.json(),
  );
  return { publicKey: signer.publicKey, signature: signer.sign(message) };
}

async function readVault(cookie = alice.cookie) {
  const response = await fixture.request(vault, cookie);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return Schema.decodeUnknownSync(WalletVaultStatusSchema)(
    await response.json(),
  );
}

async function create() {
  const proof = await challenge(first, "create");
  const response = await fixture.request(
    vault,
    alice.cookie,
    post({ ...wrapper, ...proof }),
  );
  expect(response.status).toBe(201);
}

describe("wallet vault routes", () => {
  test("requires a session, a same-origin action and the expected active account", async () => {
    expect((await fixture.request(vault)).status).toBe(401);
    expect((await fixture.request(vault, "", post(wrapper))).status).toBe(401);
    expect(
      (
        await fixture.request(vault, bob.cookie, {
          ...post(wrapper),
          headers: {
            "content-type": "application/json",
            "x-wikigems-account": alice.user.id,
          },
        })
      ).status,
    ).toBe(409);
    const crossOrigin = await handleApi(
      new Request("http://localhost:5173/api/wallet/vault", {
        ...post(wrapper),
        headers: { cookie: alice.cookie, origin: "https://other.test" },
      }),
      fixture.env,
      fixture.auth,
    );
    expect(crossOrigin.status).toBe(403);
  });

  test("wallet challenge is POST-only and checks the trusted origin and active account", async () => {
    const path = `${root}/challenge?wallet=${first.publicKey}`;
    const get = await fixture.request(path, alice.cookie);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    const send = (origin: string | undefined, account: string) =>
      handleApi(
        new Request("http://localhost:5173" + path, {
          method: "POST",
          headers: {
            cookie: alice.cookie,
            "x-wikigems-account": account,
            ...(origin ? { origin } : {}),
          },
        }),
        fixture.env,
        fixture.auth,
      );
    for (const origin of [undefined, "https://different.example"]) {
      const response = await send(origin, alice.user.id);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "UNTRUSTED_ORIGIN" });
    }
    const mismatch = await send("http://localhost:5173", bob.user.id);
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({
      code: "ACTIVE_ACCOUNT_CHANGED",
    });
    await challenge(first);
  });

  test("rejects malformed and oversized wrappers and invalid proofs", async () => {
    const proof = await challenge(first, "create");
    for (const changed of [
      { version: 2 },
      { extra: "unexpected field" },
      { prfSalt: wrapper.prfSalt.slice(0, -1) + "B" },
      { iv: "AA==" },
      { ciphertext: "A".repeat(63) },
      { credentialId: "A".repeat(1365) },
      { credentialId: "A$" },
      { publicKey: "1".repeat(44) },
      { signature: proof.signature.replace(/==$/, "") },
      { signature: second.sign("wrong challenge") },
    ]) {
      const response = await fixture.request(
        vault,
        alice.cookie,
        post({ ...wrapper, ...proof, ...changed }),
      );
      expect(response.status).toBe(400);
    }
    expect(
      (
        await fixture.request(
          vault,
          alice.cookie,
          post({ ...wrapper, ...proof, ciphertext: "A".repeat(4096) }),
        )
      ).status,
    ).toBe(413);
    expect((await readVault()).walletAddress).toBeNull();
  });

  test("creates atomically against a single-use challenge and isolates users", async () => {
    expect(await readVault()).toMatchObject({
      userId: alice.user.id,
      rpId: "localhost",
      walletAddress: null,
      vault: null,
    });
    const unsigned = await challenge(first, "create");
    const request = post({ ...wrapper, ...unsigned });
    const responses = await Promise.all([
      fixture.request(vault, alice.cookie, request),
      fixture.request(vault, alice.cookie, request),
    ]);
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.every((status) => [201, 409, 400].includes(status))).toBe(
      true,
    );
    expect((await fixture.request(vault, alice.cookie, request)).status).toBe(
      400,
    );
    expect(await readVault()).toMatchObject({
      walletAddress: first.publicKey,
      vault: {
        publicKey: first.publicKey,
        wrappers: [wrapper],
        exportedAt: null,
      },
    });
    expect(await readVault(bob.cookie)).toMatchObject({
      walletAddress: null,
      vault: null,
    });
    expect(
      (
        await fixture.request(`${wrappers}/AQ`, bob.cookie, {
          method: "DELETE",
        })
      ).status,
    ).toBe(400);
  });

  test("wrapper removal requires a fresh proof for the specific credential and keeps the last-wrapper rule", async () => {
    await create();
    const remove = (
      credentialId: string,
      proof?: { publicKey: string; signature: string },
    ) =>
      fixture.request(`${wrappers}/${credentialId}`, alice.cookie, {
        ...(proof ? post(proof) : {}),
        method: "DELETE",
      });
    expect((await remove("AQ")).status).toBe(400);
    const lastProof = await challenge(
      first,
      "delete-wrapper",
      alice.cookie,
      "AQ",
    );
    expect((await remove("AQ", lastProof)).status).toBe(409);
    const wrongKey = await challenge(second, "add-wrapper");
    expect(
      (
        await fixture.request(
          wrappers,
          alice.cookie,
          post({ ...wrapper, ...wrongKey, credentialId: "Ag" }),
        )
      ).status,
    ).toBe(409);
    const valid = await challenge(first, "add-wrapper");
    expect(
      (
        await fixture.request(
          wrappers,
          alice.cookie,
          post({ ...wrapper, ...valid }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.request(
          wrappers,
          alice.cookie,
          post({
            ...wrapper,
            ...valid,
            prfSalt: encodeBase64Url(new Uint8Array(32).fill(1)),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.request(
          wrappers,
          alice.cookie,
          post({ ...wrapper, ...valid, credentialId: "Ag" }),
        )
      ).status,
    ).toBe(201);

    const deletion = await challenge(
      first,
      "delete-wrapper",
      alice.cookie,
      "AQ",
    );
    expect((await remove("AQ")).status).toBe(400);
    expect((await remove("Ag", deletion)).status).toBe(400);
    expect((await readVault()).vault?.wrappers).toHaveLength(2);
    expect(
      (
        await remove("AQ", {
          ...deletion,
          signature: second.sign("different proof"),
        })
      ).status,
    ).toBe(400);
    expect((await remove("AQ", deletion)).status).toBe(200);
    expect((await remove("AQ", deletion)).status).toBe(400);

    expect(
      (await fixture.request(`${vault}/exported`, alice.cookie, post(deletion)))
        .status,
    ).toBe(400);
    const proof = await challenge(first, "export");
    expect(
      (await fixture.request(`${vault}/exported`, alice.cookie, post(proof)))
        .status,
    ).toBe(200);
    expect(
      (await fixture.request(`${vault}/exported`, alice.cookie, post(proof)))
        .status,
    ).toBe(400);
    const status = await readVault();
    expect(status.vault?.exportedAt).toBeTypeOf("number");
    expect(status.vault?.wrappers).toHaveLength(1);
    const remainingProof = await challenge(
      first,
      "delete-wrapper",
      alice.cookie,
      "Ag",
    );
    expect((await remove("Ag", remainingProof)).status).toBe(200);
    expect(await readVault()).toMatchObject({
      walletAddress: first.publicKey,
      vault: { wrappers: [] },
    });
  });

  test("keeps external linking and requires explicit replacement before creating", async () => {
    const legacy = await challenge(second);
    const legacyLink = (proof: typeof legacy) =>
      fixture.request(
        `${root}/link`,
        alice.cookie,
        post({ walletAddress: proof.publicKey, signature: proof.signature }),
      );
    expect((await legacyLink(legacy)).status).toBe(200);
    const proof = await challenge(first, "create");
    expect((await legacyLink(proof)).status).toBe(400);
    expect(
      (
        await fixture.request(
          vault,
          alice.cookie,
          post({ ...wrapper, ...proof }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.request(
          vault,
          alice.cookie,
          post({
            ...wrapper,
            ...proof,
            replaceExternalAddress: second.publicKey,
          }),
        )
      ).status,
    ).toBe(201);
    expect((await legacyLink(await challenge(second))).status).toBe(409);
    expect((await legacyLink(await challenge(first))).status).toBe(200);
    expect((await readVault()).walletAddress).toBe(first.publicKey);
  });
});
