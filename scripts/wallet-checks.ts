import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Schema } from "effect";
import { WalletVaultStatusSchema } from "../shared/wallet-vault";

import type * as TestSigner from "./wallet-test-signer";

export const testSignerPath = "/wallet-test-signer.js";

export async function checkWallet(page: Page) {
  const getVault = async () => {
    const response = await page.request.get("/api/wallet/vault");
    assert.equal(response.status(), 200);
    return Schema.decodeUnknownSync(WalletVaultStatusSchema)(
      await response.json(),
    );
  };
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  assert.equal(
    (await getVault()).vault,
    null,
    "sign-up leaves the vault empty",
  );
  await page.goto("/wallet");
  await button("Create wallet").click();
  await button("Lock wallet").waitFor();
  const { userId, walletAddress } = await getVault();
  assert(walletAddress);

  await page.reload();
  await button("Unlock wallet").click();
  await button("Lock wallet").waitFor();

  const bytes = [0, 1, 2, 3];
  const sign = page.evaluate(
    async ({ path, userId, bytes }) => {
      const client: typeof TestSigner = await import(path);
      return client.signWithWallet(userId, bytes);
    },
    { path: testSignerPath, userId, bytes },
  );
  const confirmation = await page.waitForEvent("dialog");
  assert.equal(confirmation.message(), "Claim the test card");
  await confirmation.accept();
  const { address, signature } = await sign;
  assert.equal(address, walletAddress);
  assert(
    ed25519.verify(
      Uint8Array.from(signature),
      Uint8Array.from(bytes),
      bs58.decode(address),
      { zip215: false },
    ),
  );

  await button("Export private key").click();
  await button("Reveal with a passkey").click();
  const secret = await page
    .getByLabel("Private key", { exact: true })
    .textContent();
  assert(secret);
  assert.equal(
    Keypair.fromSecretKey(bs58.decode(secret)).publicKey.toBase58(),
    walletAddress,
  );
  assert.equal((await getVault()).vault?.exportedAt, null);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await button("Copy private key").click();
  await button("Key copied").waitFor();
  try {
    assert(
      await page.evaluate(
        async (expected) => (await navigator.clipboard.readText()) === expected,
        secret,
      ),
    );
  } finally {
    await page.evaluate(() => navigator.clipboard.writeText(""));
  }
  await button("I saved a copy").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(typeof (await getVault()).vault?.exportedAt, "number");
  await button("Lock wallet").click();
  await button("Unlock wallet").waitFor();
}
