import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { sectionLink } from "./navigation-checks";

// Runs in account-e2e's disposable backend after real virtual-passkey signup.
export async function checkFrontend(page: Page) {
  const baseURL = new URL(page.url()).origin;
  const routes = [
    { link: "Trade", path: "/trade", heading: /Trade a little/ },
    { link: "Buy", path: "/buy", heading: /Find your next card/ },
    { link: "Sell", path: "/sell", heading: /Your cards for sale/ },
    { link: "Action", path: "/action", heading: /Put your curiosity/ },
    { link: "My collection", path: "/collection", heading: /My collection/ },
    { link: "Wallet", path: "/wallet", heading: /Wallet/ },
    { link: "Settings", path: "/settings", heading: /Settings/ },
  ];
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 320, height: 700 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const link = await sectionLink(page, route.link);
      await link.click();
      await page.waitForURL(`${baseURL}${route.path}`);
      await page
        .getByRole("heading", { level: 1, name: route.heading })
        .waitFor();
      await page
        .getByRole("dialog", { name: "More sections", exact: true })
        .waitFor({ state: "hidden" });
      assert.equal(
        await page
          .locator(`a[href="${route.path}"][aria-current="page"]`)
          .count(),
        1,
      );
      if (viewport.width < 768) {
        assert.equal(
          await page
            .getByRole("button", { name: "More sections", exact: true })
            .getAttribute("aria-expanded"),
          "false",
        );
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route.path} overflows ${viewport.width}px`,
      );
      assert.equal(
        await page.getByRole("navigation", { name: "Primary" }).count(),
        1,
      );
    }
  }
  const playLink = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Play", exact: true });
  await playLink.hover();
  await page.getByRole("tooltip", { name: "Play", exact: true }).waitFor();
  await page.mouse.move(200, 10);
  await playLink.focus();
  await page.keyboard.press("Tab");
  await page
    .getByRole("tooltip", { name: "My collection", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  const more = page.getByRole("button", { name: "More sections", exact: true });
  await more.click();
  const overflow = page.getByRole("dialog", {
    name: "More sections",
    exact: true,
  });
  await overflow.waitFor();
  await page.keyboard.press("Escape");
  await overflow.waitFor({ state: "hidden" });
  await more.click();
  await overflow.waitFor();
  await page.setViewportSize({ width: 768, height: 1024 });
  await overflow.waitFor({ state: "hidden" });
  assert(
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Wallet", exact: true })
      .isVisible(),
  );
  await page.goto(`${baseURL}/collection`);
  const allDetails = page.getByRole("button", { name: /^View details for/ });
  await allDetails.first().waitFor();
  const cardCount = await allDetails.count();
  assert.equal(cardCount, 8);
  await page
    .getByRole("group", { name: "Filter by topic" })
    .getByRole("button", { name: "Science", exact: true })
    .click();
  assert((await allDetails.count()) < cardCount);
  await page.getByRole("button", { name: "All topics", exact: true }).click();
  assert.equal(await allDetails.count(), cardCount);
  await allDetails.first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".artifacts/redesign-collection-desktop.png",
    fullPage: true,
  });
  await page.goto(`${baseURL}/wallet`);
  await page.getByRole("heading", { name: "Wallet", exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.screenshot({
    path: ".artifacts/redesign-wallet-dark-mobile.png",
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  // Deep links and missing routes are also handled by the built SPA.
  await page.reload();
  await page.getByRole("heading", { level: 1, name: /Wallet/ }).waitFor();
  await page.goto(`${baseURL}/missing-page`);
  await page
    .getByRole("heading", { name: "This article is missing from the archive." })
    .waitFor();
  await page.goto(`${baseURL}/login?add=1`);
  await page
    .getByText("Add an account. Your other accounts will stay signed in.")
    .waitFor();
  await page.getByRole("link", { name: "Back to account" }).click();
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
  await page.goto(`${baseURL}/play`);
  await page
    .getByRole("searchbox", { name: "Search Wikipedia articles" })
    .waitFor();

  await page.route("https://en.wikipedia.org/w/api.php?**", async (route) => {
    const term = new URL(route.request().url()).searchParams.get("gsrsearch");
    if (term === "unavailable")
      return route.fulfill({ status: 503, body: "Unavailable" });
    if (term === "empty") return route.fulfill({ json: {} });
    return route.fulfill({
      json: {
        query: {
          pages: {
            second: { pageid: 2, title: "Moon landing", index: 2 },
            first: {
              pageid: 1,
              title: "Moon",
              index: 1,
              extract: "Earth's natural satellite.",
            },
          },
        },
      },
    });
  });
  const input = page.getByRole("searchbox", {
    name: "Search Wikipedia articles",
  });
  const search = page.getByRole("button", { name: "Search", exact: true });
  assert(await search.isDisabled());
  await input.fill("Moon");
  await search.click();
  await page.getByRole("link", { name: "Moon", exact: true }).waitFor();
  assert.equal(await page.getByTestId("search-result").count(), 2);
  assert.match(
    await page.getByTestId("search-result").first().innerText(),
    /Moon/,
  );
  assert(
    await page
      .getByRole("button", { name: "Collect this article" })
      .first()
      .isDisabled(),
  );
  await input.fill("A different draft");
  assert.equal(
    await page.getByRole("link", { name: "Moon", exact: true }).count(),
    1,
  );
  await input.fill("empty");
  await search.click();
  await page.getByText("No matches yet", { exact: true }).waitFor();
  await input.fill("unavailable");
  await search.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Wikipedia search is unavailable" })
    .waitFor();
  await input.fill("Moon");
  await search.click();
  await page.getByRole("link", { name: "Moon", exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".artifacts/redesign-search-desktop.png",
    fullPage: true,
  });
  await page.unroute("https://en.wikipedia.org/w/api.php?**");
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "Frontend browser checks passed: desktop/mobile routes, active navigation, deep links, 404, search results/empty/error/recovery, preview collection disabled.",
  );
}
