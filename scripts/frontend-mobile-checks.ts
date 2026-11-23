import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { sectionLink } from "./navigation-checks";

export async function checkMobileFrontend(signedInPage: Page) {
  const browser = signedInPage.context().browser();
  assert(browser);
  const baseURL = new URL(signedInPage.url()).origin;
  // Reuse only the disposable test account, never the user's browser session.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    storageState: await signedInPage.context().storageState(),
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/collection`);
    const details = page.getByRole("button", { name: /^View details for/ });
    await details.first().waitFor();
    await page
      .getByRole("group", { name: "Filter by topic" })
      .getByRole("button", { name: "Science", exact: true })
      .tap();
    assert((await details.count()) < 8);
    await page
      .getByRole("group", { name: "Filter by rarity" })
      .getByRole("button", { name: "Mythic", exact: true })
      .tap();
    await page.getByText("No sample cards match these filters.").waitFor();
    await page.getByRole("button", { name: "Clear filters" }).tap();
    assert.equal(await details.count(), 8);
    await details.first().tap();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
      "Card details must fit the phone",
    );
    const close = page.getByRole("button", { name: "Close card", exact: true });
    const closeBounds = await close.boundingBox();
    assert(
      closeBounds && closeBounds.width >= 44 && closeBounds.height >= 44,
      "The close control must be easy to tap",
    );
    await close.tap();
    await dialog.waitFor({ state: "hidden" });
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const walletLink = await sectionLink(page, "Wallet", true);
      const bounds = await walletLink.boundingBox();
      assert(
        bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width,
        "Every destination is reachable without horizontal scrolling",
      );
      await walletLink.tap();
      await page
        .getByRole("heading", { name: "Wallet", exact: true })
        .waitFor();
      const nav = page.getByRole("navigation", { name: "Primary" });
      if (viewport.width < 768) {
        const more = nav.getByRole("button", {
          name: "More sections",
          exact: true,
        });
        assert.equal(await more.getAttribute("aria-expanded"), "false");
        const bounds = await more.boundingBox();
        assert(bounds && bounds.height >= 44 && bounds.width >= 44);
        const navBounds = await nav.boundingBox();
        const navStyle = await nav.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            bottom: parseFloat(style.bottom),
            radius: parseFloat(style.borderRadius),
          };
        });
        assert(
          navBounds &&
            navBounds.x >= 12 &&
            navBounds.x + navBounds.width <= viewport.width - 12 &&
            navStyle.bottom >= 12 &&
            Math.abs(
              viewport.height -
                navBounds.y -
                navBounds.height -
                navStyle.bottom,
            ) <= 1 &&
            navStyle.radius >= navBounds.height / 2,
          "The mobile navigation must float above the bottom edge as an inset pill",
        );
        assert.equal(await more.getAttribute("data-active"), "true");
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await (await sectionLink(page, "Play", true)).tap();
    const input = page.getByRole("searchbox", {
      name: "Search Wikipedia articles",
    });
    await input.waitFor();
    assert.equal(
      await input.evaluate((element) => getComputedStyle(element).fontSize),
      "16px",
    );

    let releaseSlow: () => void = () => {};
    let noteStarted: () => void = () => {};
    const slowReleased = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const slowStarted = new Promise<void>((resolve) => {
      noteStarted = resolve;
    });
    const longTitle = "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(3);
    await page.route("https://en.wikipedia.org/w/api.php?**", async (route) => {
      const term = new URL(route.request().url()).searchParams.get("gsrsearch");
      if (term === "slow") {
        noteStarted();
        await slowReleased;
      }
      const title =
        term === "slow"
          ? "Outdated result"
          : term === "long"
            ? longTitle
            : "Latest result";
      try {
        await route.fulfill({
          json: {
            query: {
              pages: {
                result: {
                  pageid: 1,
                  title,
                  index: 1,
                  extract: "A responsive search result.",
                },
              },
            },
          },
        });
      } catch (error) {
        if (!route.request().failure()) throw error;
      }
    });
    const search = page.getByRole("button", { name: "Search", exact: true });
    await input.fill("slow");
    await search.tap();
    await slowStarted;
    await input.fill("fast");
    await search.tap();
    await page
      .getByRole("link", { name: "Latest result", exact: true })
      .waitFor();
    releaseSlow();
    await page.unrouteAll({ behavior: "wait" });
    assert.equal(
      await page.getByRole("link", { name: "Outdated result" }).count(),
      0,
    );
    assert.equal(await input.inputValue(), "fast");
    await page.route("https://en.wikipedia.org/w/api.php?**", (route) =>
      route.fulfill({
        json: {
          query: {
            pages: { result: { pageid: 2, title: longTitle, index: 1 } },
          },
        },
      }),
    );
    await input.fill("long");
    await search.tap();
    await page.getByRole("link", { name: longTitle }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Long article titles must wrap on phones",
    );
    await context.setOffline(true);
    await page
      .getByRole("status")
      .filter({ hasText: "You’re offline." })
      .waitFor();
    const notice = page
      .getByRole("status")
      .filter({ hasText: "You’re offline." });
    const noticeBounds = await notice.boundingBox();
    const navBounds = await page
      .getByRole("navigation", { name: "Primary" })
      .boundingBox();
    assert(
      noticeBounds &&
        navBounds &&
        noticeBounds.y + noticeBounds.height <= navBounds.y - 8,
      "Offline notices must stay above the bottom navigation",
    );
    await context.setOffline(false);
    await page
      .getByRole("status")
      .filter({ hasText: "You’re offline." })
      .waitFor({ state: "hidden" });
    await page.screenshot({
      path: ".artifacts/mobile-touch-search.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "Mobile touch checks passed: bottom tabs, overflow selector, orientation, filters/empty recovery, dialog touch targets, form font size, latest-search wins, long titles, offline notice placement and recovery.",
    );
  } finally {
    await context.close();
  }
}
