import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";

export async function checkRouteLoading(signedInPage: Page) {
  const browser = signedInPage.context().browser();
  assert(browser);
  const baseURL = new URL(signedInPage.url()).origin;
  const storageState = await signedInPage.context().storageState();

  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      storageState,
      serviceWorkers: "block",
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      ...(mobile ? { hasTouch: true, isMobile: true } : {}),
    });
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let documents = 0;
      let tradeDownloads = 0;
      page.on("request", (request) => {
        if (request.resourceType() === "document") documents += 1;
      });
      await page.route("**/Trade-*.js", async (route) => {
        tradeDownloads += 1;
        await blocked;
        await route.continue();
      });
      await page.goto(`${baseURL}/play`);
      await page
        .getByRole("heading", { name: "Follow your curiosity.", exact: true })
        .waitFor();
      const nav = page.getByRole("navigation", { name: "Primary" });
      await nav.waitFor();
      if (mobile)
        await page
          .locator('.app-navigation > .nav-glass[data-glass="refract"]')
          .waitFor();
      const originalNav = await nav.elementHandle();
      const originalGlass = mobile
        ? await nav.locator(".nav-glass").elementHandle()
        : null;
      assert(originalNav);

      // Detect even brief hiding or replacement while the new module is blocked.
      await page.evaluate(() => {
        const original = document.querySelector(".app-navigation");
        document.documentElement.dataset.navigationDocument = "same-document";
        const sample = () => {
          if (
            !original ||
            !original.isConnected ||
            document.querySelector(".app-navigation") !== original
          ) {
            document.documentElement.dataset.navigationReplaced = "true";
          }
          if (original && !original.checkVisibility()) {
            document.documentElement.dataset.navigationHidden = "true";
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });

      const trade = nav.getByRole("link", { name: "Trade", exact: true });
      const requested = page.waitForRequest((request) =>
        /\/Trade-[^/]+\.js$/.test(new URL(request.url()).pathname),
      );
      if (mobile) {
        // Touch starts preloading and then navigates; the module stays blocked.
        await trade.tap();
        await requested;
      } else {
        await trade.hover();
        await requested;
        assert.equal(
          page.url(),
          `${baseURL}/play`,
          "Hover preloads without navigating",
        );
        assert(
          await page
            .getByRole("heading", {
              name: "Follow your curiosity.",
              exact: true,
            })
            .isVisible(),
        );
        await trade.click();
      }
      await page
        .locator(".app-content")
        .getByText("Loading your archive…", { exact: true })
        .waitFor();
      assert(
        await nav.isVisible(),
        "The navigation stays visible during a slow first visit",
      );
      assert(await originalNav.evaluate((element) => element.isConnected));
      if (originalGlass)
        assert(await originalGlass.evaluate((element) => element.isConnected));
      assert.equal(
        documents,
        1,
        "Client navigation does not reload the document",
      );
      await page.screenshot({
        path: `.artifacts/route-loading-${mobile ? "mobile" : "desktop"}.png`,
      });
      release();
      await page.getByRole("heading", { name: /Trade a little/ }).waitFor();

      await nav.getByRole("link", { name: "Play", exact: true }).click();
      await page
        .getByRole("heading", { name: "Follow your curiosity.", exact: true })
        .waitFor();
      await trade.click();
      await page.getByRole("heading", { name: /Trade a little/ }).waitFor();
      assert.equal(
        tradeDownloads,
        1,
        "The loaded module is reused on subsequent visits",
      );
      assert.equal(documents, 1);
      assert(await originalNav.evaluate((element) => element.isConnected));
      if (originalGlass)
        assert(await originalGlass.evaluate((element) => element.isConnected));
      const state = await page.evaluate(() => ({
        document: document.documentElement.dataset.navigationDocument,
        hidden: document.documentElement.dataset.navigationHidden,
        replaced: document.documentElement.dataset.navigationReplaced,
      }));
      assert.equal(state.document, "same-document");
      assert.equal(
        state.hidden,
        undefined,
        "The navigation never flashes hidden",
      );
      assert.equal(
        state.replaced,
        undefined,
        "The same navigation DOM survives the transition",
      );

      if (!mobile) {
        const settingsRequest = page.waitForRequest((request) =>
          /\/Settings-[^/]+\.js$/.test(new URL(request.url()).pathname),
        );
        await nav.getByRole("link", { name: "Settings", exact: true }).focus();
        await settingsRequest;
        assert.equal(
          page.url(),
          `${baseURL}/trade`,
          "Keyboard focus preloads without navigating",
        );
        await page.keyboard.press("Enter");
        await page
          .getByRole("heading", { name: "Settings", exact: true })
          .waitFor();
      }
      assert.deepEqual(errors, []);
    } finally {
      release();
      await context.close();
    }
  }
  console.log(
    "Route loading checks passed: hover/focus/touch preloading, scoped pending content, persistent navigation and glass, cached repeat navigation and no document reload.",
  );
}
