import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";
import { forceFrostedGlass } from "./glass-check-helpers";

const refracting = '.listing-action[data-glass="refract"]';

export async function checkListingGlass(page: Page) {
  const baseURL = new URL(page.url()).origin;
  await page.goto(`${baseURL}/buy`);
  await page.locator(refracting).first().waitFor();
  // Every action pill refracts through its own filter; no shared renderer.
  await page.waitForFunction(
    (selector) =>
      document.querySelectorAll(selector).length === 6 &&
      document.querySelectorAll(".listing-action > svg filter").length === 6,
    refracting,
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
  // Refraction 80% → 77px displacement (81px red pass); blur 12px → 1.2px frost.
  await page.waitForFunction(() => {
    const actions = [...document.querySelectorAll(".listing-action")];
    return (
      actions.length === 6 &&
      actions.every((action) => {
        const filter = action.querySelector(":scope > svg filter");
        return (
          action.getAttribute("data-glass") === "refract" &&
          getComputedStyle(action).backdropFilter.startsWith(
            `url("#${filter?.id}")`,
          ) &&
          filter?.querySelector("feDisplacementMap")?.getAttribute("scale") ===
            "81" &&
          filter.querySelector("feGaussianBlur")?.getAttribute("stdDeviation") ===
            "1.2"
        );
      })
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
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.listing-action[data-glass="solid"]')
        .length === 6,
  );
  assert.equal(await page.locator(".listing-action > svg filter").count(), 0);
  assert.equal(
    await page
      .locator(".listing-action")
      .first()
      .evaluate((el) => getComputedStyle(el).backdropFilter),
    "none",
  );

  // Restore defaults, then prove leaving the route releases the filters.
  await page.evaluate(() => localStorage.removeItem("wikigems.liquid-ui"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseURL}/buy`);
  await page.locator(refracting).first().waitFor();
  await page.getByRole("link", { name: "My collection", exact: true }).click();
  await page.waitForURL(`${baseURL}/collection`);
  await page.waitForFunction(
    () => document.querySelectorAll(".listing-action svg filter").length === 0,
  );

  // WebKit/Gecko: the action keeps a frosted surface and native semantics.
  await page.addInitScript(forceFrostedGlass);
  await page.goto(`${baseURL}/buy`);
  const fallback = page
    .locator('.listing-action[data-glass="frost"]')
    .first();
  await fallback.waitFor();
  assert.equal(
    await fallback.evaluate((el) => getComputedStyle(el).backdropFilter),
    "blur(8px) saturate(1.4)",
  );
  assert(await fallback.getByRole("button").isDisabled());
  assert.equal(await page.locator(".listing-action > svg filter").count(), 0);
  console.log(
    "Listing glass checks passed: image placement at 320/390/1440px, six refracting pills, auction links, light/dark themes, live settings, disabled purchases, route cleanup and frosted fallback.",
  );
}
