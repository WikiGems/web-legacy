import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium } from "playwright-core";
import { accountFixture } from "../tests/account-fixture";
import { handleAccount } from "../worker/account";
import { handleApi } from "../worker/api";
import { handleAccountAuth } from "../worker/account-auth";

// User data lives in disposable SQLite; pictures use an isolated Miniflare R2 bucket.
const baseURL = "http://localhost:5199";
const fixture = await accountFixture(baseURL);
const root = resolve("dist/client");
const server = Bun.serve({
  port: 5199,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/account-auth/"))
      return handleAccountAuth(request, fixture.auth);
    if (path.startsWith("/api/auth/")) return fixture.auth.handler(request);
    if (path === "/api/profile" || path.startsWith("/api/profile/"))
      return handleAccount(request, fixture.env, fixture.auth);
    if (path.startsWith("/api/"))
      return handleApi(request, fixture.env, fixture.auth);
    const absolute = resolve(root, `.${path}`);
    if (!absolute.startsWith(`${root}${sep}`))
      return new Response(null, { status: 404 });
    const file = Bun.file(absolute);
    return new Response(
      (await file.exists()) ? file : Bun.file(`${root}/index.html`),
    );
  },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        ctap2Version: "ctap2_1",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  await mkdir(".artifacts", { recursive: true });
  await page.goto(`${baseURL}/login?mode=signup`);
  await page.getByLabel("Collector name").fill("Alice Collector");
  await page.getByLabel("Email").fill("alice@example.com");
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await page.waitForURL("**/play");
  await page.getByRole("link", { name: "Account menu" }).click();
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
  await page.getByLabel("Username", { exact: true }).fill("Alice_test");
  await page.getByRole("button", { name: "Check availability" }).click();
  await page.getByText("@alice_test is available.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Reserve username" }).click();
  await page.getByText("Your username is reserved.", { exact: true }).waitFor();
  assert(await page.getByLabel("Username", { exact: true }).isDisabled());
  await page
    .getByLabel("X.com profile", { exact: true })
    .fill("https://x.com/alice_test");
  await page.getByRole("button", { name: "Save X.com link" }).click();
  await page.getByText("X.com profile saved.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "View on X.com" })
      .getAttribute("href"),
    "https://x.com/alice_test",
  );
  await page
    .getByLabel("Profile picture", { exact: true })
    .setInputFiles("public/gem.png");
  await page.getByText("Profile picture updated.", { exact: true }).waitFor();
  assert.equal(await page.locator(".account-identity img").count(), 1);
  assert.equal(await page.locator(".avatar-button img").count(), 1);
  await page.reload();
  await page.getByRole("button", { name: "Remove picture" }).waitFor();
  assert.equal(
    await page.getByLabel("Username", { exact: true }).inputValue(),
    "alice_test",
  );
  await page.screenshot({
    path: ".artifacts/account-desktop.png",
    fullPage: true,
  });

  // Canceling an addition preserves the original active session.
  await page.getByRole("link", { name: "Add another account" }).click();
  await page.getByRole("link", { name: "Back to account" }).click();
  await page.getByText("alice@example.com", { exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Add another account" }).click();
  await page.getByRole("tab", { name: "Create collector" }).click();
  await page.getByLabel("Collector name").fill("Bob Collector");
  await page.getByLabel("Email").fill("bob@example.com");
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await page.waitForURL("**/account");
  await page
    .locator(".account-identity h3")
    .filter({ hasText: "Bob Collector" })
    .waitFor();
  assert.equal(await page.locator(".account-list li").count(), 2);
  assert.equal(
    await page.getByLabel("Username", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("X.com profile", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.locator(".account-identity img").count(), 0);

  await page.getByLabel("Username", { exact: true }).fill("ALICE_test");
  await page.getByRole("button", { name: "Check availability" }).click();
  await page
    .getByText("@alice_test is already taken.", { exact: true })
    .waitFor();
  assert(
    await page.getByRole("button", { name: "Reserve username" }).isDisabled(),
  );

  await page
    .locator(".account-list li")
    .filter({ hasText: "alice@example.com" })
    .getByRole("button", { name: "Switch" })
    .click();
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: "Remove picture" }).waitFor();
  assert.equal(
    await page.getByLabel("Username", { exact: true }).inputValue(),
    "alice_test",
  );
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({
    path: ".artifacts/account-mobile.png",
    fullPage: true,
  });
  assert.equal(await page.locator("main.account-page").count(), 1);
  await page
    .getByRole("heading", { name: "Your accounts" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".artifacts/account-mobile-accounts.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Remove picture" }).click();
  await page.getByText("Profile picture removed.", { exact: true }).waitFor();
  assert.equal(await page.locator(".avatar-button img").count(), 0);

  await page
    .getByRole("button", { name: "Log out of this account", exact: true })
    .click();
  await page.waitForLoadState("load");
  await page
    .locator(".account-identity h3")
    .filter({ hasText: "Bob Collector" })
    .waitFor();
  assert.equal(await page.locator(".account-list li").count(), 1);

  // Authenticate the first account again through the add-account sign-in flow.
  const credentials = await cdp.send("WebAuthn.getCredentials", {
    authenticatorId,
  });
  const aliceCredential = credentials.credentials.find(
    (credential) => credential.userName === "alice@example.com",
  );
  assert(aliceCredential, "Alice's resident passkey exists");
  const bobCredential = credentials.credentials.find(
    (credential) => credential.userName === "bob@example.com",
  );
  assert(bobCredential, "Bob's resident passkey exists");
  await cdp.send("WebAuthn.removeCredential", {
    authenticatorId,
    credentialId: bobCredential.credentialId,
  });
  await page.getByRole("link", { name: "Add another account" }).click();
  await page.getByRole("button", { name: "Continue with passkey" }).click();
  await page.waitForURL("**/account");
  await page.getByRole("button", { name: "Log out of all accounts" }).waitFor();
  assert.equal(await page.locator(".account-list li").count(), 2);
  assert.equal(
    await page.getByLabel("Username", { exact: true }).inputValue(),
    "alice_test",
  );
  await page.getByRole("button", { name: "Log out of all accounts" }).click();
  await page.waitForURL("**/login");
  await page.goto(`${baseURL}/account`);
  await page.waitForURL("**/login");
  assert.deepEqual(errors, []);
  console.log(
    "Account browser checks passed: passkey signup, upload/removal, persistence, username conflict, X link, cancel addition, second signup, switch, mobile layout, single logout, add-account sign-in, all-account logout.",
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({
      path: ".artifacts/account-failure.png",
      fullPage: true,
    });
    console.error(
      "Failed at",
      page.url(),
      await page.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  server.stop(true);
  await fixture.cleanup();
}
