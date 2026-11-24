import { createDecipheriv, hkdfSync } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { describe, expect, test, vi } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "../shared/wallet-vault";
import { createWalletCore } from "../src/lib/wallet/core";
import {
  exportSecretKey,
  generateWallet,
  importWalletSigner,
  unwrapSeed,
  wrapSeed,
} from "../src/lib/wallet/crypto";
import type { WalletPasskeys } from "../src/lib/wallet/passkey";
import type { WalletVaultStatus, WalletWrapper } from "../shared/wallet-vault";

const seed = new Uint8Array(32).fill(42);
const prf = new Uint8Array(32).fill(62);
const context = {
  version: 1 as const,
  userId: "alice",
  credentialId: "QQ",
  prfSalt: encodeBase64Url(new Uint8Array(32).fill(11)),
  publicKey: bs58.encode(ed25519.getPublicKey(seed)),
};

describe("wallet key protection", () => {
  test("wraps and authenticates the seed, account, credential, salt and address", async () => {
    const wrapper = await wrapSeed(seed, prf, context);
    expect(await unwrapSeed(wrapper, prf, context.userId)).toEqual(seed);
    const tampered = decodeBase64Url(wrapper.ciphertext);
    tampered[0] = 1 ^ tampered[0]!;
    await expect(
      unwrapSeed(
        { ...wrapper, ciphertext: encodeBase64Url(tampered) },
        prf,
        context.userId,
      ),
    ).rejects.toThrow();
    await expect(
      unwrapSeed({ ...wrapper, credentialId: "Qg" }, prf, context.userId),
    ).rejects.toThrow();
    await expect(
      unwrapSeed(
        { ...wrapper, publicKey: bs58.encode(new Uint8Array(32)) },
        prf,
        context.userId,
      ),
    ).rejects.toThrow();
    await expect(unwrapSeed(wrapper, prf, "bob")).rejects.toThrow();
    await expect(
      unwrapSeed(wrapper, new Uint8Array(32), context.userId),
    ).rejects.toThrow();
  });

  test("derives the same HKDF key for independent wraps with fresh IVs", async () => {
    const key = Buffer.from(
      hkdfSync(
        "sha256",
        prf,
        decodeBase64Url(context.prfSalt),
        JSON.stringify([
          "wikigems.wallet.seed",
          1,
          context.userId,
          context.credentialId,
        ]),
        32,
      ),
    );
    const wrappers = [
      await wrapSeed(seed, prf, context),
      await wrapSeed(seed, prf, context),
    ];
    expect(wrappers[0]?.iv).not.toBe(wrappers[1]?.iv);
    for (const wrapper of wrappers) {
      const bytes = decodeBase64Url(wrapper.ciphertext);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        decodeBase64Url(wrapper.iv),
      );
      decipher.setAAD(bs58.decode(wrapper.publicKey));
      decipher.setAuthTag(bytes.slice(-16));
      expect(
        Buffer.concat([decipher.update(bytes.slice(0, -16)), decipher.final()]),
      ).toEqual(Buffer.from(seed));
    }
  });

  test("exports a 64-byte keypair that imports to the same address", async () => {
    const wallet = await generateWallet();
    const secret = bs58.decode(exportSecretKey(wallet.seed, wallet.publicKey));
    expect(secret.length).toBe(64);
    expect(Keypair.fromSecretKey(secret).publicKey.toBase58()).toBe(
      wallet.publicKey,
    );
    await expect(
      importWalletSigner(wallet.seed, context.publicKey),
    ).rejects.toThrow();
  });

  test("uses the pinned Ed25519 fallback when the browser lacks native support", async () => {
    const unsupported = new DOMException(
      "Ed25519 is unavailable",
      "NotSupportedError",
    );
    const generate = vi
      .spyOn(crypto.subtle, "generateKey")
      .mockRejectedValueOnce(unsupported);
    const importKey = vi
      .spyOn(crypto.subtle, "importKey")
      .mockRejectedValueOnce(unsupported);
    try {
      const wallet = await generateWallet();
      const fallback = await importWalletSigner(wallet.seed, wallet.publicKey);
      wallet.seed.fill(0);
      const message = Uint8Array.of(0, 42);
      expect(
        ed25519.verify(
          await fallback.signMessage(message),
          message,
          bs58.decode(wallet.publicKey),
        ),
      ).toBe(true);
      fallback.destroy();
      await expect(fallback.signMessage(message)).rejects.toThrow("locked");
    } finally {
      generate.mockRestore();
      importKey.mockRestore();
    }
  });
});

function coreFixture({ differentPrf = false, confirm = true } = {}) {
  const userId = context.userId;
  let vault: WalletVaultStatus["vault"] = null;
  let counter = 0;
  const passkeys: WalletPasskeys = {
    async create() {
      counter += 1;
      return {
        credentialId: encodeBase64Url(Uint8Array.of(counter)),
        output: differentPrf ? new Uint8Array(32) : prf.slice(),
      };
    },
    async evaluate({ credentialIds }) {
      const [credentialId] = credentialIds;
      if (!credentialId) throw new Error("No passkey");
      return { credentialId, output: prf.slice() };
    },
  };
  const record = (wrapper: WalletWrapper) => ({ ...wrapper, createdAt: 1 });
  const core = createWalletCore({
    passkeys,
    confirm: () => confirm,
    vault: {
      async read() {
        return {
          userId,
          rpId: "localhost",
          walletAddress: vault?.publicKey ?? null,
          vault,
        };
      },
      async challenge() {
        return "test wallet proof";
      },
      async create(_user, wrapper) {
        vault = {
          publicKey: wrapper.publicKey,
          exportedAt: null,
          wrappers: [record(wrapper)],
        };
      },
      async addWrapper(_user, wrapper) {
        if (!vault) throw new Error("No saved wallet");
        vault = { ...vault, wrappers: [...vault.wrappers, record(wrapper)] };
      },
      async removeWrapper(_user, credentialId) {
        if (!vault) throw new Error("No saved wallet");
        vault = {
          ...vault,
          wrappers: vault.wrappers.filter(
            (item) => item.credentialId !== credentialId,
          ),
        };
      },
      async exported() {
        if (!vault) throw new Error("No saved wallet");
        vault = { ...vault, exportedAt: 2 };
      },
    },
  });
  return { core, userId, vault: () => vault };
}

describe("wallet messages", () => {
  test("creates, locks, unlocks, signs and exports with a fresh passkey prompt", async () => {
    const { core, userId, vault } = coreFixture();
    const address = await core.request({
      kind: "create",
      userId,
      accountName: "alice@example.test",
    });
    core.request({ kind: "lock" });
    const request = {
      kind: "sign" as const,
      userId,
      address,
      bytes: Uint8Array.of(1, 2, 3),
      confirmation: "Claim Test card",
    };
    await expect(core.request(request)).rejects.toThrow("Unlock");
    expect(await core.request({ kind: "unlock", userId })).toBe(address);
    const signature = await core.request(request);
    expect(signature.length).toBe(64);
    expect(
      ed25519.verify(signature, request.bytes, bs58.decode(address), {
        zip215: false,
      }),
    ).toBe(true);
    await expect(
      core.request({ ...request, confirmation: "" }),
    ).rejects.toThrow("description");
    const backup = await core.request({ kind: "export", userId });
    expect(
      Keypair.fromSecretKey(bs58.decode(backup)).publicKey.toBase58(),
    ).toBe(address);
    expect(vault()?.exportedAt).toBeNull();
    await core.request({ kind: "confirm-export", userId });
    expect(vault()?.exportedAt).toBe(2);
  });

  test("requires confirmation and opens the same key with a second passkey", async () => {
    const { core, userId, vault } = coreFixture({ confirm: false });
    const account = { userId, accountName: "alice@example.test" };
    const address = await core.request({ kind: "create", ...account });
    await expect(
      core.request({
        kind: "sign",
        userId,
        address,
        bytes: Uint8Array.of(0),
        confirmation: "Pay $5",
      }),
    ).rejects.toThrow("cancelled");
    await core.request({ kind: "add-wrapper", ...account });
    expect(vault()?.wrappers).toHaveLength(2);
    await core.request({ kind: "remove-wrapper", userId, credentialId: "AQ" });
    core.request({ kind: "lock" });
    expect(await core.request({ kind: "unlock", userId })).toBe(address);
  });

  test("keeps the vault empty when a second PRF evaluation returns a different key", async () => {
    const { core, userId, vault } = coreFixture({ differentPrf: true });
    await expect(
      core.request({
        kind: "create",
        userId,
        accountName: "alice@example.test",
      }),
    ).rejects.toMatchObject({ code: "PRF_UNSUPPORTED" });
    expect(vault()).toBeNull();
  });
});
