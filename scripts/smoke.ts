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
await page.screenshot({ path: ".artifacts/home.png", fullPage: true });
console.log("Home:", await page.locator("h1").first().innerText());

await page.getByRole("button", { name: /Open your desk with a passkey/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: ".artifacts/auth.png" });

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
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
console.log("Authenticator:", authenticatorId);

const email = `ada-${Date.now()}@example.com`;
await page.getByLabel("Display name").fill("Ada Lovelace");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: /Create passkey/i }).click();
await page.waitForURL("**/desk", { timeout: 20000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
await page.screenshot({ path: ".artifacts/desk.png", fullPage: true });
console.log("Desk:", await page.locator("h1").first().innerText());

const saveButtons = page.locator(".recommend-section .save-button");
if (await saveButtons.count()) {
  await saveButtons.first().click();
  await page.waitForTimeout(700);
  console.log("Watchlist rows:", await page.locator(".watch-row").count());
  await page.screenshot({ path: ".artifacts/desk-saved.png", fullPage: true });
}

await page.locator(".avatar-button").click();
await page.getByRole("button", { name: /Sign in/i }).first().waitFor({ timeout: 20000 });
console.log("Signed out. URL:", page.url());

await page.getByRole("button", { name: /Sign in/i }).first().click();
await page.getByRole("button", { name: /Continue with passkey/i }).click();
await page.waitForURL("**/desk", { timeout: 20000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
console.log("Signed back in. Desk:", await page.locator("h1").first().innerText());
await page.screenshot({ path: ".artifacts/desk-reauth.png", fullPage: true });

console.log("Errors:", errors.length ? errors : "none");
await browser.close();
