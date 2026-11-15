import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { chromium, type Page } from "playwright-core";

const root = resolve("dist/client");
const headers = new Headers();
for (const line of (await Bun.file("public/_headers").text())
  .split("\n\n")[0]
  ?.split("\n")
  .slice(1) ?? []) {
  const colon = line.indexOf(":");
  if (colon > 0)
    headers.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
}
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/solana-rpc"))
      return Response.json(
        path === "/api/auth/get-session"
          ? null
          : { error: "Offline-sensitive fixture" },
        {
          status: path === "/api/auth/get-session" ? 200 : 401,
          headers: { "cache-control": "no-store" },
        },
      );
    const absolute =
      path === "/" ? join(root, "index.html") : resolve(root, `.${path}`);
    if (!absolute.startsWith(root + sep))
      return new Response(null, { status: 404 });
    const file = Bun.file(absolute);
    const response = new Response(
      (await file.exists()) ? file : Bun.file(join(root, "index.html")),
      { headers },
    );
    if (
      path === "/sw.js" ||
      path === "/manifest.webmanifest" ||
      path === "/registerSW.js"
    )
      response.headers.set("cache-control", "no-cache");
    return response;
  },
});
const baseURL = `http://localhost:${server.port}`;
const profile = await mkdtemp(join(tmpdir(), "wikigems-pwa-"));
// A persistent disposable profile avoids the browser's incognito install restriction.
const context = await chromium.launchPersistentContext(profile, {
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  viewport: { width: 1280, height: 900 },
});
const errors: string[] = [];
// Check real eligibility through CDP, then substitute only the one-shot prompt
// boundary so native browser events cannot race the scripted user choices.
await context.addInitScript(() => {
  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      if (event.isTrusted) event.stopImmediatePropagation();
    },
    true,
  );
});
function track(page: Page) {
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
}
async function fakePrompt(
  page: Page,
  outcome: "accepted" | "dismissed" | "failure",
) {
  const prevented = await page.evaluate((choice) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    let resolveChoice: (value: {
      outcome: "accepted" | "dismissed";
    }) => void = () => {};
    const userChoice = new Promise<{ outcome: "accepted" | "dismissed" }>(
      (resolve) => {
        resolveChoice = resolve;
      },
    );
    document.documentElement.dataset.promptCalls = "0";
    Object.defineProperties(event, {
      userChoice: { value: userChoice },
      prompt: {
        value: () => {
          document.documentElement.dataset.promptCalls = String(
            Number(document.documentElement.dataset.promptCalls) + 1,
          );
          document.documentElement.dataset.promptActivated = String(
            navigator.userActivation.isActive,
          );
          if (choice === "failure")
            return Promise.reject(
              new DOMException("Browser refused", "NotAllowedError"),
            );
          resolveChoice({ outcome: choice });
          return Promise.resolve();
        },
      },
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, outcome);
  assert(
    !prevented,
    "Do not suppress the browser's automatic install promotion",
  );
}
const offer = (page: Page) =>
  page.getByRole("complementary", { name: "Install WikiGems" });
try {
  await mkdir(".artifacts", { recursive: true });
  const page = context.pages()[0] ?? (await context.newPage());
  track(page);
  await page.goto(baseURL);
  await offer(page).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))))
    await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const manifest = await cdp.send("Page.getAppManifest");
  assert.deepEqual(manifest.errors, []);
  assert.equal(manifest.manifest.id, `${baseURL}/`);
  assert.equal(manifest.manifest.startUrl, `${baseURL}/play`);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual(
    installability.installabilityErrors,
    [],
    "Real browser installability diagnostics",
  );
  console.log(
    "PWA eligibility passed in a non-incognito profile: manifest, icons, active service worker and no installability errors.",
  );

  await fakePrompt(page, "dismissed");
  await offer(page)
    .getByRole("button", { name: "Install app", exact: true })
    .click();
  await offer(page).waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.promptCalls),
    "1",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.promptActivated),
    "true",
  );
  await page.reload();
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(
    await offer(page).count(),
    0,
    "Dismissal survives navigation and reload in this tab",
  );

  await page.evaluate(() =>
    sessionStorage.removeItem("wikigems.pwa.dismissed"),
  );
  await page.reload();
  await fakePrompt(page, "failure");
  await offer(page)
    .getByRole("button", { name: "Install app", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Install WikiGems", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await fakePrompt(page, "accepted");
  await offer(page)
    .getByRole("button", { name: "Install app", exact: true })
    .click();
  await offer(page).waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => localStorage.getItem("wikigems.pwa.installed")),
    null,
    "Acceptance alone does not claim installation completed",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  assert.equal(
    await page.evaluate(() => localStorage.getItem("wikigems.pwa.installed")),
    "1",
  );
  await page.reload();
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(await offer(page).count(), 0);
  await fakePrompt(page, "dismissed");
  await offer(page).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("wikigems.pwa.installed")),
    null,
    "A fresh native event overrides a stale installed hint",
  );
  await offer(page)
    .getByRole("button", { name: "Not now", exact: true })
    .click();

  const browser = context.browser();
  assert(browser);
  const mobile = await browser.newContext({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
  });
  await mobile.addInitScript(() => {
    window.addEventListener(
      "beforeinstallprompt",
      (event) => {
        if (event.isTrusted) event.stopImmediatePropagation();
      },
      true,
    );
  });
  try {
    const phone = await mobile.newPage();
    track(phone);
    await phone.goto(baseURL);
    await offer(phone)
      .getByRole("button", { name: "How to install", exact: true })
      .tap();
    const dialog = phone.getByRole("dialog", {
      name: "Install WikiGems",
      exact: true,
    });
    await dialog.waitFor();
    await dialog.getByText(/Add to Home Screen/).waitFor();
    await phone.waitForFunction(() => {
      let element = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!element) return false;
      while (element) {
        if (
          Number(getComputedStyle(element).opacity) < 0.99 ||
          element
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
        )
          return false;
        element = element.parentElement;
      }
      return true;
    });
    assert(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await phone.screenshot({
      path: ".artifacts/pwa-install-mobile.png",
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Got it", exact: true }).tap();
    await offer(phone)
      .getByRole("button", { name: "Not now", exact: true })
      .tap();
    await phone.reload();
    await phone.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(await offer(phone).count(), 0);
    const standalone = await mobile.newPage();
    await standalone.addInitScript(() =>
      Object.defineProperty(navigator, "standalone", { value: true }),
    );
    track(standalone);
    await standalone.goto(baseURL);
    await standalone.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(await offer(standalone).count(), 0);
  } finally {
    await mobile.close();
  }

  await page.evaluate(async () => {
    await fetch("/api/profile");
    await fetch("/solana-rpc");
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#root main")),
  );
  assert.match(
    await page.locator("body").innerText(),
    /offline|Your session could not be checked/i,
  );
  assert.equal(
    await page.evaluate(() =>
      fetch("/api/profile").then(
        () => true,
        () => false,
      ),
    ),
    false,
  );
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    );
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  assert(cached.includes("/index.html"));
  assert(
    !cached.some(
      (path) => path.startsWith("/api/") || path.startsWith("/solana-rpc"),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PWA flows passed: arrival offer, native activation/one-shot use, cancellation, refusal fallback, installation completion, mobile instructions, standalone suppression, offline shell and uncached private APIs.",
  );
} catch (error) {
  const page = context.pages()[0];
  if (page) {
    console.error(
      "PWA test state",
      page.url(),
      await page.locator("body").innerText(),
      await page.evaluate(() => ({
        calls: document.documentElement.dataset.promptCalls,
        activated: document.documentElement.dataset.promptActivated,
      })),
    );
    await page.screenshot({
      path: ".artifacts/pwa-failure.png",
      fullPage: true,
    });
  }
  throw error;
} finally {
  await context.close();
  server.stop(true);
  await rm(profile, { recursive: true, force: true });
}
