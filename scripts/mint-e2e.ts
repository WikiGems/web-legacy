import { chromium } from "playwright-core";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://localhost:5173";
const RPC = "http://127.0.0.1:8899";
const BRIDGE_PORT = 8789;

const wallet = Keypair.generate();
const address = wallet.publicKey.toBase58();
console.log("Test wallet:", address);

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return response.json() as Promise<any>;
}

const airdrop = await rpc("requestAirdrop", [address, 2_000_000_000]);
console.log("Airdrop:", airdrop.result ?? airdrop.error);
await Bun.sleep(2500);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const bridge = Bun.serve({
  port: BRIDGE_PORT,
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const body = (await request.json()) as { type: string; data: string };
    if (body.type === "message") {
      const signature = nacl.sign.detached(
        Uint8Array.from(Buffer.from(body.data, "base64")),
        wallet.secretKey,
      );
      return Response.json({ signature: Buffer.from(signature).toString("base64") }, { headers: cors });
    }
    if (body.type === "transaction") {
      const bytes = Buffer.from(body.data, "base64");
      let signed: Buffer;
      try {
        const tx = Transaction.from(bytes);
        tx.partialSign(wallet);
        signed = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      } catch {
        const tx = VersionedTransaction.deserialize(bytes);
        tx.sign([wallet]);
        signed = Buffer.from(tx.serialize());
      }
      return Response.json({ signature: signed.toString("base64") }, { headers: cors });
    }
    return new Response("bad request", { status: 400, headers: cors });
  },
});
console.log("Signing bridge on", BRIDGE_PORT);

await mkdir(".artifacts", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 300)}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(({ address, bridgePort }) => {
  const encoded = new TextEncoder();
  const provider = {
    publicKey: { toString: () => address },
    async connect() {
      return { publicKey: { toString: () => address } };
    },
    async disconnect() {},
    async signMessage(message: Uint8Array) {
      const response = await fetch(`http://localhost:${bridgePort}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "message",
          data: btoa(String.fromCharCode(...message)),
        }),
      });
      const payload = (await response.json()) as { signature: string };
      return {
        signature: Uint8Array.from(atob(payload.signature), (char) => char.charCodeAt(0)),
      };
    },
    async signTransaction(transaction: any) {
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const response = await fetch(`http://localhost:${bridgePort}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "transaction",
          data: btoa(String.fromCharCode(...serialized)),
        }),
      });
      const payload = (await response.json()) as { signature: string };
      const bytes = Uint8Array.from(atob(payload.signature), (char) => char.charCodeAt(0));
      const ctor: any = transaction.constructor;
      if (typeof ctor.from === "function") return ctor.from(bytes);
      return ctor.deserialize(bytes);
    },
    async signAllTransactions(transactions: any[]) {
      const result = [];
      for (const transaction of transactions) result.push(await provider.signTransaction(transaction));
      return result;
    },
  };
  (window as any).phantom = { solana: provider };
  (window as any).__WALLET_ADDRESS__ = address;
  // Keep the injected script's TextEncoder reference alive for older engines.
  void encoded;
}, { address, bridgePort: BRIDGE_PORT });

await page.goto(baseURL, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Play free/i }).click();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    ctap2Version: "ctap2_1",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
const email = `mint-${Date.now()}@example.com`;
await page.getByLabel("Collector name").fill("Mint Tester");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: /Create passkey/i }).click();
await page.waitForURL("**/play", { timeout: 20000 });
await page.waitForLoadState("networkidle");

await page.getByRole("button", { name: /Tear open a pack/i }).click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /Reveal all cards/i }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Keep all 5/i }).click();
await page.waitForTimeout(700);

await page.getByRole("button", { name: /^Album/i }).first().click();
await page.waitForTimeout(500);
await page.locator(".album-grid .game-card").first().click();
await page.waitForTimeout(400);

await page.getByRole("button", { name: /Connect wallet to mint/i }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Phantom/i }).first().click();
await page.waitForTimeout(2500);
console.log("Wallet linked, modal visible:", await page.locator(".card-modal").isVisible());

await page.getByRole("button", { name: /Mint NFT on Solana/i }).click();
await page.waitForTimeout(12000);
await page.screenshot({ path: ".artifacts/wg-minted.png", fullPage: true });
const mintText = await page.locator(".minted-panel").count();
console.log("Minted panel:", mintText);
console.log("Card status:", await page.locator(".card-modal").innerText().then((text) => text.slice(0, 500)));
console.log("Errors:", errors.length ? errors : "none");

await writeFile(".artifacts/mint-e2e.txt", `wallet=${address}\nminted=${mintText}\n`, "utf8");
await browser.close();
bridge.stop();
