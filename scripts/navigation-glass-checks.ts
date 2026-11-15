import { strict as assert } from "node:assert";
import type { Locator, Page } from "playwright-core";

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
  assert.equal(await signedInPage.locator(".app-navigation canvas").count(), 0);
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
    const ready = page.locator('.app-navigation[data-glass="ready"]');
    await ready.waitFor();
    assert.equal(await ready.locator("canvas").count(), 1);
    assert.equal(await ready.getByRole("link").count(), 4);
    assert.equal(
      await ready.evaluate(
        (element) => getComputedStyle(element).backdropFilter,
      ),
      "none",
    );

    // A changing backdrop must change the rendered glass, not only the DOM.
    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.dataset.testid = "glass-backdrop";
      marker.style.cssText = "height:1200px;background:rgb(255,0,0)";
      document.querySelector<HTMLElement>(".app-content")?.appendChild(marker);
      window.scrollTo(0, marker.getBoundingClientRect().top + scrollY - 100);
    });
    await page.waitForTimeout(600);
    const barSample = { page, surface: ready, x: 0.4, y: 0.15 };
    const red = await glassColor(barSample);
    assert(red.red > red.blue + 30, JSON.stringify(red));
    const more = ready.getByRole("button", {
      name: "More sections",
      exact: true,
    });
    const popup = page.getByRole("dialog", {
      name: "More sections",
      exact: true,
    });
    const popupReady = page.locator('.nav-overflow-panel[data-glass="ready"]');
    await more.tap();
    await popupReady.waitFor();
    assert.equal(await popup.getByRole("link").count(), 5);
    assert.equal(await page.locator("canvas[data-liquid-ignore]").count(), 2);
    const popupSample = { page, surface: popupReady, x: 0.9, y: 0.5 };
    const popupRed = await glassColor(popupSample);
    assert(popupRed.red > popupRed.blue + 30, JSON.stringify(popupRed));
    await page.getByTestId("glass-backdrop").evaluate((element) => {
      element.style.background = "rgb(0,0,255)";
    });
    await page.waitForTimeout(600);
    const blue = await glassColor(barSample);
    assert(blue.blue > blue.red + 30, JSON.stringify(blue));
    const popupBlue = await glassColor(popupSample);
    assert(popupBlue.blue > popupBlue.red + 30, JSON.stringify(popupBlue));
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    assert.equal(await page.locator("canvas[data-liquid-ignore]").count(), 1);
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
      await ready.waitFor();
      await more.tap();
      await popupReady.waitFor();
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
    await ready.getByRole("link", { name: "Trade", exact: true }).tap();
    await page.getByRole("heading", { name: /Trade a little/ }).waitFor();
    await ready
      .getByRole("button", { name: "More sections", exact: true })
      .tap();
    await popupReady.waitFor();
    await page
      .getByRole("dialog", { name: "More sections", exact: true })
      .getByRole("link", { name: "Wallet", exact: true })
      .tap();
    await page.getByRole("heading", { name: "Wallet", exact: true }).waitFor();
    await popup.waitFor({ state: "hidden" });
    assert.equal(await page.locator("canvas[data-liquid-ignore]").count(), 1);
    await ready.getByRole("link", { name: "Account menu", exact: true }).tap();
    await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
    for (const width of [320, 375, 767, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      if (width < 768) {
        await ready.waitFor();
        assert.equal(await ready.locator("canvas").count(), 1);
      } else {
        await page
          .locator(".app-navigation canvas")
          .waitFor({ state: "detached" });
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
    await page.locator(".app-navigation canvas").waitFor({ state: "detached" });
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await ready.waitFor();
    await cdp.detach();
    assert.deepEqual(errors, []);

    // Lose the real GPU resource; the existing CSS material must take over.
    await page.locator(".app-navigation canvas").evaluate((element) => {
      const backend = window.__liquidGLRenderer__?.backend;
      if (backend?.kind === "webgpu") {
        backend.device.destroy();
        return;
      }
      if (!(element instanceof HTMLCanvasElement))
        throw new Error("Expected a canvas");
      const gl = element.getContext("webgl2") ?? element.getContext("webgl");
      if (!gl) throw new Error("A real GPU backend is required");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await page.locator(".app-navigation canvas").waitFor({ state: "detached" });
    assert.equal(
      await page
        .getByRole("navigation", { name: "Primary" })
        .getAttribute("data-glass"),
      null,
    );
    await page.getByRole("link", { name: "Play", exact: true }).tap();
    await page
      .getByRole("searchbox", { name: "Search Wikipedia articles" })
      .waitFor();

    const webgl = await context.newPage();
    await webgl.goto(`${baseURL}/play?liquidGL-engine=webgl2`);
    await webgl.locator('.app-navigation[data-glass="ready"]').waitFor();
    assert.equal(
      await webgl.evaluate(() => window.__liquidGLRenderer__?.backend?.kind),
      "webgl",
    );
    await webgl
      .getByRole("button", { name: "More sections", exact: true })
      .tap();
    await webgl.locator('.nav-overflow-panel[data-glass="ready"]').waitFor();
    await webgl.keyboard.press("Escape");
    await webgl
      .getByRole("dialog", { name: "More sections", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(await webgl.locator("canvas[data-liquid-ignore]").count(), 1);
    await webgl.close();

    const fallback = await context.newPage();
    await fallback.addInitScript("window.__liquidGLNoWebGL__ = true");
    await fallback.goto(`${baseURL}/play`);
    await fallback.locator(".nav-glass[style]").waitFor();
    await fallback.waitForFunction(
      () =>
        !document.querySelector(".app-navigation")?.hasAttribute("data-glass"),
    );
    assert.equal(await fallback.locator(".app-navigation canvas").count(), 0);
    await fallback
      .getByRole("button", { name: "More sections", exact: true })
      .tap();
    const fallbackPopup = fallback.getByRole("dialog", {
      name: "More sections",
      exact: true,
    });
    await fallbackPopup.waitFor();
    await fallback.waitForFunction(
      () =>
        !document
          .querySelector(".nav-overflow-panel")
          ?.hasAttribute("data-glass"),
    );
    assert.equal(
      await fallback.locator("canvas[data-liquid-ignore]").count(),
      0,
    );
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
      "Navigation glass checks passed: bar/popup refracted pixels, content refresh, theme, routes, dismissal/focus, resizing, CSP, GPU loss and CSS fallback.",
    );
  } finally {
    await context.close();
  }
}
