import { checkHaptics } from "./haptics-checks";
import { checkNavigationGlass } from "./navigation-glass-checks";
import { checkSettings } from "./settings-checks";
import { checkListingGlass } from "./listing-glass-checks";
import { checkAuctions } from "./auction-checks";
import { checkRouteLoading } from "./route-loading-checks";
import { checkEmailVerification } from "./email-verification-checks";
import type { VerificationEmail } from "../worker/email";
import { checkMobileFrontend } from "./frontend-mobile-checks";
import { checkFrontend } from "./frontend-checks";
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
const verificationEmails: VerificationEmail[] = [];
const fixture = await accountFixture(baseURL, async (message) => {
  verificationEmails.push(message);
});
const root = resolve("dist/client");
const assetHeaders = new Headers();
if (
  process.argv.includes("--navigation-glass") ||
  process.argv.includes("--settings") ||
  process.argv.includes("--listing-glass") ||
  process.argv.includes("--auctions") ||
  process.argv.includes("--route-loading")
) {
  const headers = await Bun.file("public/_headers").text();
  const policy = headers.match(/Content-Security-Policy: (.+)/)?.[1];
  assert(policy, "The navigation test must enforce the app's CSP");
  assetHeaders.set("Content-Security-Policy", policy);
}
const server = Bun.serve({
  port: 5199,
  async fetch(request) {
    const headers = new Headers(request.headers);
    headers.set("cf-connecting-ip", "127.0.0.1");
    request = new Request(request, { headers });
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/account-auth/"))
      return handleAccountAuth(request, fixture.auth);
    if (path.startsWith("/api/auth/")) return fixture.auth.handler(request);
    if (path === "/api/profile" || path.startsWith("/api/profile/"))
      return handleAccount(request, fixture.env, fixture.auth);
    if (path.startsWith("/api/"))
      return handleApi(request, fixture.env, fixture.auth);
    const absolute =
      path === "/" ? resolve(root, "index.html") : resolve(root, `.${path}`);
    if (!absolute.startsWith(`${root}${sep}`))
      return new Response(null, { status: 404 });
    const file = Bun.file(absolute);
    return new Response(
      (await file.exists()) ? file : Bun.file(`${root}/index.html`),
      { headers: assetHeaders },
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
    ...(process.argv.includes("--email-verification")
      ? { hasTouch: true, isMobile: true }
      : {}),
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
  await page.goto(baseURL);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.screenshot({
    path: ".artifacts/redesign-landing-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({
    path: ".artifacts/redesign-landing-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Start collecting", exact: true })
    .click();
  await page.getByLabel("Collector name").waitFor();
  await page.screenshot({
    path: ".artifacts/redesign-signup-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Collector name").fill("Alice Collector");
  await page.getByLabel("Email").fill("alice@example.com");
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await page.waitForURL("**/play");
  const signupToast = page
    .locator('[data-slot="toast"]')
    .filter({ hasText: "Collector card created" });
  await signupToast.waitFor();
  await signupToast
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  if (process.argv.includes("--route-loading")) {
    await checkRouteLoading(page);
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--auctions")) {
    await checkAuctions(page);
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--listing-glass")) {
    await checkListingGlass(page);
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--settings")) {
    await checkSettings(page);
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--navigation-glass")) {
    await checkNavigationGlass(page);
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--email-verification")) {
    await checkEmailVerification(page, verificationEmails);
    assert.deepEqual(errors, []);
  } else if (process.argv.includes("--haptics")) {
    await checkHaptics(page);
  } else {
    if (!process.argv.includes("--account")) {
      await checkRouteLoading(page);
      await checkFrontend(page);
      await checkMobileFrontend(page);
      await checkHaptics(page);
    }
    await page.getByRole("link", { name: "Account menu" }).click();
    await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
    await page.getByLabel("Username", { exact: true }).fill("Alice_test");
    await page.getByRole("button", { name: "Check availability" }).click();
    await page
      .getByText("@alice_test is available.", { exact: false })
      .waitFor();
    await page.getByRole("button", { name: "Reserve username" }).click();
    await page
      .getByText("Your username is reserved.", { exact: true })
      .waitFor();
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
    const fileChooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Change profile picture", exact: true })
      .click();
    await (await fileChooser).setFiles("public/gem.png");
    await page.getByText("Profile picture updated.", { exact: true }).waitFor();
    assert.equal(
      await page.getByTestId("account-identity").locator("img").count(),
      1,
    );
    assert.equal(
      await page.getByTestId("account-menu").locator("img").count(),
      1,
    );
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
    await page
      .getByText("alice@example.com", { exact: true })
      .first()
      .waitFor();
    await page.getByRole("link", { name: "Add another account" }).click();
    await page.getByRole("tab", { name: "Create collector" }).click();
    await page.getByLabel("Collector name").fill("Bob Collector");
    await page.getByLabel("Email").fill("bob@example.com");
    await page
      .getByRole("button", { name: "Create passkey", exact: true })
      .click();
    await page.waitForURL("**/account");
    await page
      .getByTestId("account-identity")
      .locator("h3")
      .filter({ hasText: "Bob Collector" })
      .waitFor();
    assert.equal(
      await page.getByTestId("account-list").locator("li").count(),
      2,
    );
    assert.equal(
      await page.getByLabel("Username", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await page.getByLabel("X.com profile", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await page.getByTestId("account-identity").locator("img").count(),
      0,
    );

    await page.getByLabel("Username", { exact: true }).fill("ALICE_test");
    await page.getByRole("button", { name: "Check availability" }).click();
    await page
      .getByText("@alice_test is already taken.", { exact: true })
      .waitFor();
    assert(
      await page.getByRole("button", { name: "Reserve username" }).isDisabled(),
    );

    await page
      .getByTestId("account-list")
      .locator("li")
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
    assert.equal(await page.getByTestId("account-page").count(), 1);
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
    assert.equal(
      await page.getByTestId("account-menu").locator("img").count(),
      0,
    );

    await page
      .getByRole("button", { name: "Log out of this account", exact: true })
      .click();
    await page.waitForLoadState("load");
    await page
      .getByTestId("account-identity")
      .locator("h3")
      .filter({ hasText: "Bob Collector" })
      .waitFor();
    assert.equal(
      await page.getByTestId("account-list").locator("li").count(),
      1,
    );

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
    await page
      .getByRole("button", { name: "Log out of all accounts" })
      .waitFor();
    assert.equal(
      await page.getByTestId("account-list").locator("li").count(),
      2,
    );
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
  }
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
