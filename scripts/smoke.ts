import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://localhost:5173";
await mkdir(".artifacts", { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(baseURL, { waitUntil: "networkidle" });
await page.screenshot({ path: ".artifacts/wm-home.png", fullPage: true });
console.log("Home:", await page.locator("h1").first().innerText());

await page.getByRole("button", { name: /Play free/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: ".artifacts/wm-auth.png" });

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

const email = `collector-${Date.now()}@example.com`;
await page.getByLabel("Collector name").fill("Ada Lovelace");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: /Create passkey/i }).click();
await page.waitForURL("**/play", { timeout: 20000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await page.screenshot({ path: ".artifacts/wm-play-empty.png", fullPage: true });
console.log("Play URL:", page.url());
console.log("Pack hall:", await page.locator("h1").first().innerText());

await page.getByRole("button", { name: /Tear open a pack/i }).click();
await page.waitForTimeout(1000);
console.log("Pack overlay:", await page.locator(".pack-overlay h2").innerText());
await page.screenshot({ path: ".artifacts/wm-pack.png", fullPage: true });
await page.getByRole("button", { name: /Reveal all cards/i }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: ".artifacts/wm-pack-revealed.png", fullPage: true });
await page.getByRole("button", { name: /Keep all 5/i }).click();
await page.waitForTimeout(1000);

await page.getByRole("button", { name: /^Album/i }).first().click();
await page.waitForTimeout(700);
console.log("Album cards:", await page.locator(".album-grid .game-card").count());
await page.screenshot({ path: ".artifacts/wm-album.png", fullPage: true });

await page.locator(".album-grid .game-card").first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: ".artifacts/wm-card.png" });
await page.locator(".card-modal-close").click();

await page.getByRole("button", { name: /^Duel/i }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Start the duel/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: ".artifacts/wm-duel.png", fullPage: true });

console.log("Errors:", errors.length ? errors : "none");
await browser.close();
