import { chromium, type BrowserContext, type Page } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

async function makeUser(name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
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
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Play free/i }).click();
  await page.getByLabel("Collector name").fill(name);
  await page.getByLabel("Email").fill(`${name.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@example.com`);
  await page.getByRole("button", { name: /Create passkey/i }).click();
  await page.waitForURL("**/play", { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Tear open a pack/i }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Reveal all cards/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Keep all 5/i }).click();
  await page.waitForTimeout(1000);
  return { context, page };
}

const alice = await makeUser("Trade Alice");
const bob = await makeUser("Trade Bob");
console.log("Alice cards:", await alice.page.evaluate(() => fetch("/api/game/state").then(r => r.json()).then((d: any) => d.cards.length)));
console.log("Bob cards:", await bob.page.evaluate(() => fetch("/api/game/state").then(r => r.json()).then((d: any) => d.cards.length)));

// List Bob's first card through the UI.
await bob.page.getByRole("button", { name: /^Album/i }).first().click();
await bob.page.waitForTimeout(400);
await bob.page.locator(".album-grid .game-card").first().click();
await bob.page.waitForTimeout(300);
await bob.page.getByRole("button", { name: /List for trade/i }).click();
await bob.page.waitForTimeout(700);
await bob.page.locator(".card-modal-close").click();

const bobState = (await bob.page.evaluate(() => fetch("/api/game/state").then(r => r.json()))) as { cards: any[] };
const listed = bobState.cards.find((card: any) => card.forTrade);
console.log("Listed by Bob:", listed?.title);

await alice.page.getByRole("button", { name: /^Exchange/i }).first().click();
await alice.page.waitForTimeout(500);
await alice.page.screenshot({ path: ".artifacts/wg-exchange.png", fullPage: true });

const stateAlice = (await alice.page.evaluate(() => fetch("/api/game/state").then(r => r.json()))) as { cards: any[] };
const offer = stateAlice.cards.find((card: any) => card.status === "claimed");
const proposal = await alice.page.evaluate(async ({ offered, requested }) => {
  const response = await fetch("/api/trades", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offeredCardId: offered, requestedCardId: requested }),
  });
  return { status: response.status, body: await response.json() };
}, { offered: offer.id, requested: listed.id });
console.log("Proposal:", proposal);

await bob.page.reload({ waitUntil: "networkidle" });
await bob.page.waitForTimeout(500);
await bob.page.getByRole("button", { name: /^Exchange/i }).first().click();
await bob.page.waitForTimeout(500);
console.log("Incoming offers:", await bob.page.locator(".trade-offer").count());
await bob.page.screenshot({ path: ".artifacts/wg-incoming.png", fullPage: true });
await bob.page.getByRole("button", { name: /^Accept$/ }).first().click();
await bob.page.waitForTimeout(1500);

const aliceAfter = (await alice.page.evaluate(() => fetch("/api/game/state").then(r => r.json()))) as { cards: any[] };
const bobAfter = (await bob.page.evaluate(() => fetch("/api/game/state").then(r => r.json()))) as { cards: any[] };
console.log("Alice now has requested card:", aliceAfter.cards.some((c: any) => c.id === listed.id));
console.log("Bob now has offered card:", bobAfter.cards.some((c: any) => c.id === offer.id));
console.log("Alice owner of offered:", aliceAfter.cards.find((c: any) => c.id === offer.id)?.ownerName);
console.log("Bob owner of requested:", bobAfter.cards.find((c: any) => c.id === listed.id)?.ownerName);

await alice.page.getByRole("button", { name: /^Exchange/i }).first().click();
await alice.page.waitForTimeout(500);
await alice.page.screenshot({ path: ".artifacts/wg-after-trade.png", fullPage: true });

await alice.context.close();
await bob.context.close();
await browser.close();
