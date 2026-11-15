import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { sectionLink } from "./navigation-checks";
import {
  auctionCards,
  formatAuctionAmount,
  previewAuctions,
} from "../src/lib/auction-preview";

export async function checkAuctions(page: Page) {
  const baseURL = new URL(page.url()).origin;
  const auction = previewAuctions[0];
  const lastCard = auctionCards.at(-1);
  assert(auction && lastCard);
  const minimum = formatAuctionAmount(auction.currentBid + auction.increment);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/api\/.*(auction|bid)/.test(request.url())
    )
      writes.push(request.url());
  });
  await page.goto(`${baseURL}/buy`);
  await page
    .getByRole("link", { name: "Place a bid", exact: true })
    .first()
    .click();
  await page.waitForURL(`${baseURL}/auctions/${auction.id}`);
  await page
    .getByRole("heading", { level: 1, name: auction.card.title, exact: true })
    .waitFor();
  await page.locator('.listing-marketplace[data-glass="ready"]').waitFor();
  assert.equal(
    await page.evaluate(() => window.__liquidGLRenderer__?.lenses.length),
    2,
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Buy", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  const amount = page.getByLabel("Your bid (USDC)", { exact: true });
  assert.equal(await amount.inputValue(), minimum);
  for (const invalid of ["", "0", "0.01", "1e3", "0.3500001"]) {
    await amount.fill(invalid);
    await page.getByRole("button", { name: "Review bid", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: `Enter at least ${minimum}` })
      .waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
  }
  await amount.fill("0.350001");
  await amount.press("Enter");
  const bidReview = page.getByRole("dialog", {
    name: "Review your bid",
    exact: true,
  });
  await bidReview.waitFor();
  assert(
    await bidReview.getByText("0.350001 USDC", { exact: true }).isVisible(),
  );
  assert(
    await bidReview
      .getByRole("button", { name: "Place bid", exact: true })
      .isDisabled(),
  );
  await page.waitForFunction(() =>
    Boolean(document.activeElement?.closest('[role="dialog"]')),
  );
  await page.keyboard.press("Escape");
  await bidReview.waitFor({ state: "hidden" });
  assert.equal(await amount.inputValue(), "0.350001");
  await page.getByRole("button", { name: "Minimum bid", exact: true }).click();
  assert.equal(await amount.inputValue(), minimum);
  await page
    .getByRole("button", { name: "Minimum + 0.10 USDC", exact: true })
    .click();
  assert.equal(await amount.inputValue(), "0.45");

  await page.goto(`${baseURL}/sell`);
  await page
    .getByRole("link", { name: "List a card for bidding", exact: true })
    .click();
  await page.waitForURL(`${baseURL}/auctions/new`);
  await page
    .getByRole("heading", {
      level: 1,
      name: "List a card for bidding",
      exact: true,
    })
    .waitFor();
  await page.locator('.listing-marketplace[data-glass="ready"]').waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Sell", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await page
    .getByLabel("Sample card", { exact: true })
    .selectOption(lastCard.id);
  const starting = page.getByLabel("Starting bid (USDC)", { exact: true });
  const increment = page.getByLabel("Minimum increment (USDC)", {
    exact: true,
  });
  await starting.fill("-1");
  await increment.fill("0");
  await page
    .getByRole("button", { name: "Review auction", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "positive starting bid" })
    .waitFor();
  await starting.fill("1.234567");
  await increment.fill("0.000001");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  const preview = page.getByLabel("Auction preview", { exact: true });
  await preview.getByText(lastCard.title, { exact: true }).waitFor();
  assert(await preview.getByText("1.234567 USDC", { exact: true }).isVisible());
  assert(await preview.getByText("0.000001 USDC", { exact: true }).isVisible());
  assert(await preview.getByText("7 days", { exact: true }).isVisible());
  await page
    .getByRole("button", { name: "Review auction", exact: true })
    .click();
  const listingReview = page.getByRole("dialog", {
    name: "Review your auction",
    exact: true,
  });
  await listingReview.waitFor();
  assert(
    await listingReview.getByText(lastCard.title, { exact: true }).isVisible(),
  );
  assert(
    await listingReview.getByText("1.234567 USDC", { exact: true }).isVisible(),
  );
  assert(
    await listingReview
      .getByRole("button", { name: "Publish auction", exact: true })
      .isDisabled(),
  );
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    assert(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      ),
    );
  }
  await listingReview
    .getByRole("button", { name: "Back to editing", exact: true })
    .click();
  await listingReview.waitFor({ state: "hidden" });
  assert.equal(await starting.inputValue(), "1.234567");
  assert.equal(
    await page
      .getByRole("button", { name: "7 days", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );

  for (const width of [1440, 320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["new", auction.id]) {
      await page.goto(`${baseURL}/auctions/${route}`);
      await page.locator('.listing-marketplace[data-glass="ready"]').waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const submit = page.getByRole("button", {
        name: route === "new" ? "Review auction" : "Review bid",
        exact: true,
      });
      const bounds = await submit.boundingBox();
      assert(
        bounds &&
          bounds.height >= 44 &&
          bounds.x >= 0 &&
          bounds.x + bounds.width <= width,
      );
      await page.screenshot({
        path: `.artifacts/auction-${route === "new" ? "listing" : "bid"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.screenshot({
    path: ".artifacts/auction-bid-dark.png",
    fullPage: true,
  });
  await page.goto(`${baseURL}/auctions/new`);
  await page.locator('.listing-marketplace[data-glass="ready"]').waitFor();
  await page.screenshot({
    path: ".artifacts/auction-listing-dark.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    localStorage.setItem(
      "wikigems.liquid-ui",
      JSON.stringify({ mode: "off", refraction: 50, blur: 8, opacity: 58 }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "wikigems.liquid-ui" }),
    );
  });
  await page.locator('.listing-marketplace[data-liquid-ui="off"]').waitFor();
  assert.equal(await page.locator("canvas[data-liquid-ignore]").count(), 0);
  assert.equal(
    await page
      .locator(".listing-action")
      .first()
      .evaluate((el) => getComputedStyle(el).backdropFilter),
    "none",
  );
  await page.evaluate(() => localStorage.removeItem("wikigems.liquid-ui"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseURL}/auctions/missing`);
  await page
    .getByRole("heading", { name: "Auction not found", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("body > canvas[data-liquid-ignore]").count(),
    0,
  );
  const browser = page.context().browser();
  assert(browser);
  const touchContext = await browser.newContext({
    viewport: { width: 320, height: 700 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
    storageState: await page.context().storageState(),
  });
  try {
    const mobile = await touchContext.newPage();
    const errors: string[] = [];
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(`${baseURL}/sell`);
    await mobile
      .getByRole("link", { name: "List a card for bidding", exact: true })
      .tap();
    await mobile
      .getByLabel("Sample card", { exact: true })
      .selectOption(lastCard.id);
    await mobile.getByRole("button", { name: "7 days", exact: true }).tap();
    await mobile
      .getByLabel("Starting bid (USDC)", { exact: true })
      .fill("2.50");
    await mobile
      .getByRole("button", { name: "Review auction", exact: true })
      .tap();
    const dialog = mobile.getByRole("dialog", {
      name: "Review your auction",
      exact: true,
    });
    await dialog.waitFor();
    assert(await dialog.getByText("2.50 USDC", { exact: true }).isVisible());
    assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
    await dialog
      .getByRole("button", { name: "Back to editing", exact: true })
      .tap();
    await dialog.waitFor({ state: "hidden" });
    const buyLink = await sectionLink(mobile, "Buy", true);
    await buyLink.tap();
    await mobile
      .getByRole("link", { name: "Place a bid", exact: true })
      .first()
      .tap();
    await mobile.getByLabel("Your bid (USDC)", { exact: true }).fill("1.00");
    await mobile.getByRole("button", { name: "Review bid", exact: true }).tap();
    const bidDialog = mobile.getByRole("dialog", {
      name: "Review your bid",
      exact: true,
    });
    await bidDialog.waitFor();
    assert(await bidDialog.getByText("1.00 USDC", { exact: true }).isVisible());
    await mobile.screenshot({ path: ".artifacts/auction-review-touch.png" });
    await bidDialog
      .getByRole("button", { name: "Back to editing", exact: true })
      .tap();
    await bidDialog.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
  } finally {
    await touchContext.close();
  }
  await page.addInitScript(() =>
    Object.defineProperty(window, "__liquidGLNoWebGL__", { value: true }),
  );
  await page.goto(`${baseURL}/auctions/new`);
  await page
    .getByRole("button", { name: "Review auction", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-glass="loading"]'),
  );
  assert.equal(
    await page
      .locator(".listing-action")
      .first()
      .evaluate((el) => getComputedStyle(el).backdropFilter),
    "blur(8px)",
  );
  await page
    .getByRole("button", { name: "Review auction", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review your auction", exact: true })
    .waitFor();
  assert.deepEqual(writes, []);
  console.log(
    "Auction checks passed: listing links, deep links, precise bid validation, live listing preview, duration, review/focus, disabled submissions, responsive light/dark layouts, 320px touch flows, liquid settings, missing auction and GPU fallback.",
  );
}
