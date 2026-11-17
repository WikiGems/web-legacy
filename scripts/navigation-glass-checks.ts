import { strict as assert } from "node:assert";
import type { Locator, Page } from "playwright-core";
import {
  backdropFilter,
  forceFrostedGlass,
  refractionFilterId,
} from "./glass-check-helpers";

async function glassColor({
  page,
  surface,
  x,
  y,
}: {
  page: Page;
  surface: Locator;
  x: number;
  y: number;
}) {
  const screenshot = await surface.screenshot();
  return page.evaluate(
    async ({ bytes, x, y }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("A screenshot decoder is required");
      context.drawImage(image, 0, 0);
      image.close();
      const pixel = context.getImageData(
        Math.round(canvas.width * x),
        Math.round(canvas.height * y),
        1,
        1,
      ).data;
      return { red: pixel[0] ?? 0, blue: pixel[2] ?? 0 };
    },
    { bytes: Array.from(screenshot), x, y },
  );
}

export async function checkNavigationGlass(signedInPage: Page) {
  // Desktop keeps a solid sidebar; the glass layer is hidden and builds no map.
  const desktopGlass = signedInPage.locator(".app-navigation > .nav-glass");
  assert(!(await desktopGlass.isVisible()));
  assert.equal(await refractionFilterId(desktopGlass), null);
  const browser = signedInPage.context().browser();
  assert(browser);
  const baseURL = new URL(signedInPage.url()).origin;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    colorScheme: "light",
    serviceWorkers: "block",
    storageState: await signedInPage.context().storageState(),
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${baseURL}/collection`);
    const bar = page.getByRole("navigation", { name: "Primary" });
    const barGlass = page.locator(
      '.app-navigation > .nav-glass[data-glass="refract"]',
    );
    await barGlass.waitFor();
    assert.equal(await bar.getByRole("link").count(), 4);
    const barFilter = await refractionFilterId(barGlass);
    assert(barFilter, "The bar must render its refraction filter");
    assert((await backdropFilter(barGlass)).startsWith(`url("#${barFilter}")`));

    // The glass samples the live backdrop, so a repaint shows through at once.
    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.dataset.testid = "glass-backdrop";
      marker.style.cssText = "height:1200px;background:rgb(255,0,0)";
      document.querySelector<HTMLElement>(".app-content")?.appendChild(marker);
      window.scrollTo(0, marker.getBoundingClientRect().top + scrollY - 100);
    });
    await page.waitForTimeout(100);
    const barSample = { page, surface: bar, x: 0.4, y: 0.15 };
    const red = await glassColor(barSample);
    assert(red.red > red.blue + 30, JSON.stringify(red));
    const more = bar.getByRole("button", {
      name: "More sections",
      exact: true,
    });
    const popup = page.getByRole("dialog", {
      name: "More sections",
      exact: true,
    });
    const popupPanel = page.locator(".nav-overflow-panel");
    const popupGlass = page.locator(
      '.nav-overflow-panel > .nav-glass[data-glass="refract"]',
    );
    const filters = page.locator(".nav-glass svg filter");
    await more.tap();
    await popupGlass.waitFor();
    assert.equal(await popup.getByRole("link").count(), 5);
    assert.equal(await filters.count(), 2);
    const popupSample = { page, surface: popupPanel, x: 0.9, y: 0.5 };
    const popupRed = await glassColor(popupSample);
    assert(popupRed.red > popupRed.blue + 30, JSON.stringify(popupRed));
    await page.getByTestId("glass-backdrop").evaluate((element) => {
      element.style.background = "rgb(0,0,255)";
    });
    await page.waitForTimeout(100);
    const blue = await glassColor(barSample);
    assert(blue.blue > blue.red + 30, JSON.stringify(blue));
    const popupBlue = await glassColor(popupSample);
    assert(popupBlue.blue > popupBlue.red + 30, JSON.stringify(popupBlue));
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    assert.equal(await filters.count(), 1);
    assert(
      await more.evaluate((element) => document.activeElement === element),
    );
    await page
      .getByTestId("glass-backdrop")
      .evaluate((element) => element.remove());
    await page.evaluate(() => window.scrollTo(0, 0));

    for (const colorScheme of ["dark", "light"] satisfies (
      "dark" | "light"
    )[]) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        colorScheme,
      );
      await barGlass.waitFor();
      await more.tap();
      await popupGlass.waitFor();
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `.artifacts/navigation-more-glass-${colorScheme}.png`,
      });
      await page.keyboard.press("Escape");
      await popup.waitFor({ state: "hidden" });
      if (colorScheme === "dark") {
        await page.waitForTimeout(350);
        await page.screenshot({
          path: ".artifacts/navigation-liquid-glass-dark-mobile.png",
        });
      }
    }
    await bar.getByRole("link", { name: "Trade", exact: true }).tap();
    await page.getByRole("heading", { name: /Trade a little/ }).waitFor();
    await bar.getByRole("button", { name: "More sections", exact: true }).tap();
    await popupGlass.waitFor();
    await popup.getByRole("link", { name: "Wallet", exact: true }).tap();
    await page.getByRole("heading", { name: "Wallet", exact: true }).waitFor();
    await popup.waitFor({ state: "hidden" });
    assert.equal(await filters.count(), 1);
    await bar.getByRole("link", { name: "Account menu", exact: true }).tap();
    await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
    let previousFilter = await refractionFilterId(barGlass);
    for (const width of [320, 375, 767, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const glass = page.locator(".app-navigation > .nav-glass");
      if (width < 768) {
        // The displacement map follows the bar's size.
        await page.waitForFunction(
          (previous) =>
            document.querySelector(".app-navigation > .nav-glass svg filter")
              ?.id !== previous,
          previousFilter,
        );
        await barGlass.waitFor();
        previousFilter = await refractionFilterId(barGlass);
      } else {
        await glass.waitFor({ state: "hidden" });
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: ".artifacts/navigation-liquid-glass-mobile.png",
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    const solid = page.locator(
      '.app-navigation > .nav-glass[data-glass="solid"]',
    );
    await solid.waitFor();
    assert.equal(await backdropFilter(solid), "none");
    assert.equal(await filters.count(), 0);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await barGlass.waitFor();
    await cdp.detach();
    assert.deepEqual(errors, []);

    // WebKit and Gecko cannot refract; they get the same frosted material.
    const fallback = await context.newPage();
    await fallback.addInitScript(forceFrostedGlass);
    await fallback.goto(`${baseURL}/play`);
    const frostedBar = fallback.locator(
      '.app-navigation > .nav-glass[data-glass="frost"]',
    );
    await frostedBar.waitFor();
    assert.match(await backdropFilter(frostedBar), /^blur\(8px\)/);
    assert.equal(await fallback.locator(".nav-glass svg").count(), 0);
    await fallback
      .getByRole("button", { name: "More sections", exact: true })
      .tap();
    const fallbackPopup = fallback.getByRole("dialog", {
      name: "More sections",
      exact: true,
    });
    await fallbackPopup.waitFor();
    await fallback
      .locator('.nav-overflow-panel > .nav-glass[data-glass="frost"]')
      .waitFor();
    assert.equal(await fallback.locator(".nav-glass svg").count(), 0);
    await fallbackPopup
      .getByRole("link", { name: "Wallet", exact: true })
      .tap();
    await fallback
      .getByRole("heading", { name: "Wallet", exact: true })
      .waitFor();
    await fallback
      .getByRole("link", { name: "Account menu", exact: true })
      .tap();
    await fallback
      .getByRole("heading", { name: "Account", exact: true })
      .waitFor();
    console.log(
      "Navigation glass checks passed: bar/popup refracted live pixels, theme, routes, dismissal/focus, resizing, CSP, reduced transparency and frosted fallback.",
    );
  } finally {
    await context.close();
  }
}
