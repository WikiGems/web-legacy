import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { sectionLink } from "./navigation-checks";

declare global {
  interface Window {
    __wikigemsHapticCalls: number[][];
  }
}

export async function checkHaptics(signedInPage: Page) {
  const browser = signedInPage.context().browser();
  assert(browser);
  const baseURL = new URL(signedInPage.url()).origin;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    storageState: await signedInPage.context().storageState(),
  });
  try {
    await context.addInitScript(() => {
      window.__wikigemsHapticCalls = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (pattern: number | number[]) => {
          window.__wikigemsHapticCalls.push(
            typeof pattern === "number" ? [pattern] : [...pattern],
          );
          return true;
        },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/play`);
    await page.getByRole("searchbox").waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.__wikigemsHapticCalls),
      [],
      "Initial rendering must not vibrate",
    );
    const patterns: number[][] = [];
    for (const destination of ["Trade", "Buy", "Sell"]) {
      const link = await sectionLink(page, destination, true);
      await page.evaluate(() => {
        window.__wikigemsHapticCalls = [];
      });
      await link.tap();
      await page.getByRole("heading", { level: 1 }).waitFor();
      const calls = await page.evaluate(() => window.__wikigemsHapticCalls);
      assert.equal(
        calls.length,
        1,
        `${destination} should emit one semantic pattern`,
      );
      const pattern = calls[0];
      assert(pattern);
      patterns.push(pattern);
    }
    assert.deepEqual(patterns, [
      [18, 35, 18],
      [12, 30, 28],
      [32, 35, 12],
    ]);
    await page.evaluate(() => {
      window.__wikigemsHapticCalls = [];
    });
    const disabled = page.getByRole("button", {
      name: "List a card",
      exact: true,
    });
    assert(await disabled.isDisabled());
    // Native disabled clicks and HeroUI both suppress the action and its feedback.
    await disabled.evaluate((element) => {
      if (element instanceof HTMLButtonElement) element.click();
    });
    assert.deepEqual(
      await page.evaluate(() => window.__wikigemsHapticCalls),
      [],
    );

    await page.getByRole("link", { name: "Account menu" }).tap();
    const toggle = page.getByRole("switch", {
      name: "Haptic feedback",
      exact: true,
    });
    await page.getByLabel("Username", { exact: true }).fill("haptic_check");
    await page.evaluate(() => {
      window.__wikigemsHapticCalls = [];
    });
    await page.getByRole("button", { name: "Check availability" }).tap();
    await page
      .getByText("@haptic_check is available.", { exact: false })
      .waitFor();
    const success = await page.evaluate(() => window.__wikigemsHapticCalls);
    assert.deepEqual(
      success,
      [[8], [15, 45, 30]],
      "Press feedback and confirmed result have distinct patterns",
    );
    await page
      .getByLabel("X.com profile", { exact: true })
      .fill("https://x.com/haptic_check");
    await page
      .getByRole("button", { name: "Save X.com link", exact: true })
      .tap();
    await page
      .locator('[data-slot="toast"]')
      .filter({ hasText: "X.com profile saved." })
      .waitFor();
    await page.waitForFunction(() => {
      const toast = document.querySelector('[data-slot="toast"]');
      const nav = document.querySelector('nav[aria-label="Primary"]');
      return (
        toast &&
        nav &&
        toast.getBoundingClientRect().bottom <=
          nav.getBoundingClientRect().top - 8
      );
    });
    await page
      .locator('[data-slot="toast"]')
      .getByRole("button", { name: "Dismiss", exact: true })
      .tap();
    await page.getByLabel("Username", { exact: true }).fill("admin");
    await page.evaluate(() => {
      window.__wikigemsHapticCalls = [];
    });
    await page.getByRole("button", { name: "Check availability" }).tap();
    await page
      .getByRole("alert")
      .filter({ hasText: "This username is reserved." })
      .waitFor();
    assert.deepEqual(await page.evaluate(() => window.__wikigemsHapticCalls), [
      [8],
      [32, 30, 32, 30, 48],
    ]);
    await (await sectionLink(page, "Settings", true)).tap();
    await toggle.waitFor();
    assert(await toggle.isChecked());
    await page.getByTestId("haptic-toggle").tap();
    assert(!(await toggle.isChecked()));
    await page.getByRole("link", { name: "Account menu" }).tap();
    await page.getByLabel("Username", { exact: true }).fill("admin");
    await page.evaluate(() => {
      window.__wikigemsHapticCalls = [];
    });
    await page.getByRole("button", { name: "Check availability" }).tap();
    await page
      .getByRole("alert")
      .filter({ hasText: "This username is reserved." })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.__wikigemsHapticCalls),
      [],
    );
    await (await sectionLink(page, "Settings", true)).tap();
    await page.reload();
    await toggle.waitFor();
    assert(!(await toggle.isChecked()), "The opt-out survives a reload");
    await page.getByTestId("haptic-toggle").tap();
    assert(await toggle.isChecked());
    await page.reload();
    await toggle.waitFor();
    assert(await toggle.isChecked(), "The opt-in survives a reload");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await toggle.isChecked(),
      "An explicit choice takes precedence over the default",
    );
    await page.evaluate(() => localStorage.removeItem("wikigems.haptics"));
    await page.reload();
    await toggle.waitFor();
    assert(
      !(await toggle.isChecked()),
      "Reduced motion defaults to no haptics",
    );
    // Browser API refusal must not prevent navigation or result in unhandled rejection.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByTestId("haptic-toggle").tap();
    if (!(await toggle.isChecked()))
      await page.getByTestId("haptic-toggle").tap();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: () => {
          throw new DOMException("Unavailable", "NotAllowedError");
        },
      });
    });
    await (await sectionLink(page, "Buy", true)).tap();
    await page.getByRole("heading", { name: "Find your next card." }).waitFor();
    // Truly absent vibration: exercise the real library fallback without changing actions.
    const unsupported = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      storageState: await signedInPage.context().storageState(),
      serviceWorkers: "block",
      reducedMotion: "no-preference",
    });
    try {
      await unsupported.addInitScript(() => {
        Object.defineProperty(navigator, "vibrate", {
          value: undefined,
          configurable: true,
        });
      });
      const fallbackPage = await unsupported.newPage();
      fallbackPage.on("pageerror", (error) => errors.push(error.message));
      await fallbackPage.goto(`${baseURL}/play`);
      await (await sectionLink(fallbackPage, "Trade", true)).tap();
      await fallbackPage
        .getByRole("heading", { name: "Trade a little knowledge." })
        .waitFor();
      assert(
        await fallbackPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.equal(
        await fallbackPage.locator('label[for^="web-haptics-"]').count(),
        1,
        "The library fallback is reused rather than duplicated",
      );
    } finally {
      await unsupported.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "Haptics checks passed: distinct swap/buy/sell, press/success/error, silent disabled controls, persisted opt-out, reduced motion and unsupported/refused APIs.",
    );
  } finally {
    await context.close();
  }
}
