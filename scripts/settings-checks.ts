import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { sectionLink } from "./navigation-checks";

export async function checkSettings(signedInPage: Page) {
  await (await sectionLink(signedInPage, "Settings")).click();
  await signedInPage
    .getByRole("heading", { name: "Settings", exact: true })
    .waitFor();
  const browser = signedInPage.context().browser();
  assert(browser);
  const baseURL = new URL(signedInPage.url()).origin;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
    storageState: await signedInPage.context().storageState(),
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/play`);
    await (await sectionLink(page, "Settings", true)).tap();
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    const liquid = page.getByRole("switch", { name: "Liquid UI", exact: true });
    const haptics = page.getByRole("switch", {
      name: "Haptic feedback",
      exact: true,
    });
    const refraction = page.getByRole("slider", {
      name: "Refraction",
      exact: true,
    });
    const blur = page.getByRole("slider", { name: "Blur", exact: true });
    const opacity = page.getByRole("slider", { name: "Opacity", exact: true });
    const ready = page.locator('.app-navigation[data-glass="ready"]');
    await ready.waitFor();
    assert(await haptics.isChecked());
    await page.getByTestId("haptic-toggle").tap();
    assert(!(await haptics.isChecked()));
    await page.getByTestId("liquid-ui-toggle").tap();
    assert(!(await liquid.isChecked()));
    await page
      .locator("canvas[data-liquid-ignore]")
      .waitFor({ state: "detached" });
    assert(await refraction.isDisabled());
    assert.equal(
      await page
        .locator(".app-navigation")
        .evaluate((element) => getComputedStyle(element).backdropFilter),
      "none",
    );
    await page.reload();
    await liquid.waitFor();
    assert(!(await liquid.isChecked()));
    assert(!(await haptics.isChecked()));
    await page.getByTestId("liquid-ui-toggle").tap();
    await ready.waitFor();
    const originalCanvas = await ready.locator("canvas").elementHandle();
    assert(originalCanvas);
    for (const slider of [refraction, blur, opacity]) {
      await slider.focus();
      await slider.press("End");
    }
    assert.equal(await refraction.getAttribute("value"), "100");
    assert.equal(await blur.getAttribute("value"), "20");
    assert.equal(await opacity.getAttribute("value"), "100");
    assert(
      await originalCanvas.evaluate((element) => element.isConnected),
      "Adjusting optics must reuse the active renderer",
    );
    assert.equal(
      await page.evaluate(
        () => window.__liquidGLRenderer__?.lenses[0]?.options.refraction,
      ),
      0.02,
    );
    const material = await ready.evaluate((element) => ({
      blur: element.style.getPropertyValue("--liquid-ui-blur"),
      opacity: element.style.getPropertyValue("--liquid-ui-opacity"),
    }));
    assert.deepEqual(material, { blur: "20px", opacity: "100%" });
    await page.reload();
    await ready.waitFor();
    assert.equal(await refraction.getAttribute("value"), "100");
    assert.equal(await blur.getAttribute("value"), "20");
    assert.equal(await opacity.getAttribute("value"), "100");
    await page
      .getByRole("button", { name: "Reset liquid UI", exact: true })
      .tap();
    assert.equal(await refraction.getAttribute("value"), "50");
    assert.equal(await blur.getAttribute("value"), "8");
    assert.equal(await opacity.getAttribute("value"), "58");

    const otherTab = await context.newPage();
    await otherTab.goto(`${baseURL}/settings`);
    await otherTab.getByTestId("liquid-ui-toggle").tap();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".app-navigation")
          ?.getAttribute("data-liquid-ui") === "off",
    );
    assert(!(await liquid.isChecked()), "Preferences must update across tabs");
    await page
      .getByRole("button", { name: "Reset liquid UI", exact: true })
      .tap();
    await otherTab.waitForFunction(
      () =>
        document
          .querySelector(".app-navigation")
          ?.getAttribute("data-liquid-ui") === "on",
    );
    await otherTab.close();
    await ready.waitFor();
    await (await sectionLink(page, "Settings", true)).tap();
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    for (const value of [
      "{broken",
      '{"mode":"on","refraction":999,"blur":-1,"opacity":500}',
    ]) {
      await page.evaluate(
        (value) => localStorage.setItem("wikigems.liquid-ui", value),
        value,
      );
      await page.reload();
      await liquid.waitFor();
      assert.equal(await refraction.getAttribute("value"), "50");
      assert.equal(await blur.getAttribute("value"), "8");
      assert.equal(await opacity.getAttribute("value"), "58");
    }
    await page
      .getByRole("button", { name: "Reset liquid UI", exact: true })
      .tap();
    await page.getByTestId("haptic-toggle").tap();
    assert(await haptics.isChecked());
    const fallback = await context.newPage();
    fallback.on("pageerror", (error) => errors.push(error.message));
    await fallback.addInitScript("window.__liquidGLNoWebGL__ = true");
    await fallback.goto(`${baseURL}/settings`);
    await fallback.getByRole("slider", { name: "Blur", exact: true }).focus();
    await fallback
      .getByRole("slider", { name: "Blur", exact: true })
      .press("End");
    await fallback
      .getByRole("slider", { name: "Opacity", exact: true })
      .focus();
    await fallback
      .getByRole("slider", { name: "Opacity", exact: true })
      .press("End");
    await fallback.waitForFunction(
      () =>
        !document.querySelector(".app-navigation")?.hasAttribute("data-glass"),
    );
    assert.equal(
      await fallback.locator("canvas[data-liquid-ignore]").count(),
      0,
    );
    assert(
      await fallback
        .locator(".app-navigation")
        .evaluate((element) =>
          getComputedStyle(element).backdropFilter.includes("blur(20px)"),
        ),
    );
    assert(
      await fallback
        .locator(".app-navigation")
        .evaluate((element) => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("A color decoder is required");
          context.fillStyle = getComputedStyle(element).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return context.getImageData(0, 0, 1, 1).data[3] === 255;
        }),
      "The CSS fallback must honor full opacity",
    );
    await fallback
      .getByRole("button", { name: "Reset liquid UI", exact: true })
      .tap();
    await fallback.close();
    const restricted = await context.newPage();
    await restricted.addInitScript(() => {
      for (const name of ["getItem", "setItem"]) {
        Object.defineProperty(Storage.prototype, name, {
          configurable: true,
          value() {
            throw new DOMException("Storage unavailable", "SecurityError");
          },
        });
      }
    });
    restricted.on("pageerror", (error) => errors.push(error.message));
    await restricted.goto(`${baseURL}/settings`);
    await restricted.getByTestId("liquid-ui-toggle").tap();
    await restricted
      .locator("canvas[data-liquid-ignore]")
      .waitFor({ state: "detached" });
    await restricted.getByRole("link", { name: "Play", exact: true }).tap();
    await (await sectionLink(restricted, "Settings", true)).tap();
    assert(
      !(await restricted
        .getByRole("switch", { name: "Liquid UI", exact: true })
        .isChecked()),
      "Blocked storage must retain the current tab's choice",
    );
    await restricted.close();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `.artifacts/settings-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "Settings checks passed: desktop/mobile access, immediate controls, renderer reuse, reload persistence, cross-tab updates, invalid/blocked storage and responsive layout.",
    );
  } finally {
    await context.close();
  }
}
