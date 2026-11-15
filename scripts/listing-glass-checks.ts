import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";

export async function checkListingGlass(page: Page) {
  const baseURL = new URL(page.url()).origin;
  await page.goto(`${baseURL}/buy`);
  await page.locator('.listing-marketplace[data-glass="ready"]').waitFor();
  assert.equal(
    await page.locator("body > canvas[data-liquid-ignore]").count(),
    1,
  );
  assert.equal(
    await page.evaluate(() => window.__liquidGLRenderer__?.lenses.length),
    6,
  );

  for (const width of [1440, 320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const action of await page.locator(".listing-action").all()) {
      const purchase = action.getByRole("button");
      if (await purchase.count()) {
        assert(await purchase.isDisabled(), "Sample purchases stay disabled");
      } else {
        assert.match(
          (await action.getByRole("link").getAttribute("href")) ?? "",
          /^\/auctions\//,
        );
      }
      const geometry = await action.evaluate((element) => {
        const artwork = element.closest(".listing-artwork");
        if (!artwork) throw new Error("The action must be on the artwork");
        const image = artwork.getBoundingClientRect();
        const action = element.getBoundingClientRect();
        const category =
          element.previousElementSibling?.getBoundingClientRect();
        return {
          inside:
            action.left >= image.left &&
            action.right <= image.right &&
            action.top >= image.top &&
            action.bottom <= image.bottom,
          separate: category && category.right <= action.left,
          height: action.height,
          radius: parseFloat(getComputedStyle(element).borderRadius),
        };
      });
      assert(
        geometry.inside && geometry.separate,
        "The pill fits beside the category inside the image",
      );
      assert(geometry.height >= 44 && geometry.radius >= geometry.height / 2);
    }
    assert.equal(
      await page.getByRole("button", { name: "Buy now", exact: true }).count(),
      3,
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Place a bid", exact: true })
        .count(),
      3,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.locator(".listing-artwork").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.artifacts/listing-glass-${width}.png` });
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.screenshot({ path: ".artifacts/listing-glass-dark.png" });
  // Apply a cross-tab settings change without leaving the mounted marketplace.
  await page.evaluate(() => {
    localStorage.setItem(
      "wikigems.liquid-ui",
      JSON.stringify({
        mode: "on",
        refraction: 80,
        blur: 12,
        opacity: 70,
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "wikigems.liquid-ui" }),
    );
  });
  await page.waitForFunction(() => {
    const action = document.querySelector(".listing-action");
    const lenses = window.__liquidGLRenderer__?.lenses;
    return (
      action &&
      getComputedStyle(action).backdropFilter === "blur(12px)" &&
      lenses?.length === 6 &&
      lenses.every((lens) => lens.options.refraction === 0.016)
    );
  });
  await page.evaluate(() => {
    localStorage.setItem(
      "wikigems.liquid-ui",
      JSON.stringify({
        mode: "off",
        refraction: 80,
        blur: 12,
        opacity: 70,
      }),
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

  // Restore defaults, then prove route teardown removes the shared card canvas.
  await page.evaluate(() => localStorage.removeItem("wikigems.liquid-ui"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseURL}/buy`);
  await page.locator('.listing-marketplace[data-glass="ready"]').waitFor();
  await page.getByRole("link", { name: "My collection", exact: true }).click();
  await page.waitForURL(`${baseURL}/collection`);
  await page.waitForFunction(
    () => document.querySelectorAll("canvas[data-liquid-ignore]").length === 0,
  );

  // No GPU: the action keeps its frosted surface and native disabled semantics.
  await page.addInitScript(() =>
    Object.defineProperty(window, "__liquidGLNoWebGL__", { value: true }),
  );
  await page.goto(`${baseURL}/buy`);
  const fallback = page.locator(".listing-action").first();
  await fallback.waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-glass="loading"]'),
  );
  assert.equal(
    await fallback.evaluate((el) => getComputedStyle(el).backdropFilter),
    "blur(8px)",
  );
  assert(await fallback.getByRole("button").isDisabled());
  assert.equal(await page.locator("canvas[data-liquid-ignore]").count(), 0);
  console.log(
    "Listing glass checks passed: image placement at 320/390/1440px, shared six-lens renderer, auction links, light/dark themes, live settings, disabled purchases, route cleanup and CSS fallback.",
  );
}
