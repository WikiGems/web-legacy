import { strict as assert } from "node:assert";
import type { Locator, Page } from "playwright-core";

export async function checkToasts(page: Page, touch = false) {
  const card = page.locator('[data-slot="toast"]');
  const press = (button: Locator) => (touch ? button.tap() : button.click());
  for (const { button, type, title } of [
    { button: "Success notification", type: "success", title: "Card saved" },
    { button: "Error notification", type: "error", title: "Trade failed" },
    {
      button: "Info notification",
      type: "info",
      title: "Wallet connection needed",
    },
  ]) {
    await press(page.getByRole("button", { name: button, exact: true }));
    await card.filter({ hasText: title }).waitFor();
    assert.equal(await card.getAttribute("data-type"), type);
    assert(
      (await page.getByRole("region", { name: /Notifications/ }).count()) === 1,
    );
    const bounds = await card.boundingBox();
    const viewport = page.viewportSize();
    assert(
      viewport &&
        bounds &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= viewport.width,
    );
    const dismiss = card.getByRole("button", { name: "Dismiss", exact: true });
    const closeBounds = await dismiss.boundingBox();
    assert(closeBounds && closeBounds.width >= 44 && closeBounds.height >= 44);
    if (touch) await dismiss.tap();
    else {
      await dismiss.focus();
      await page.keyboard.press("Enter");
    }
    await card.waitFor({ state: "hidden" });
  }
  await press(
    page.getByRole("button", { name: "Timed notification", exact: true }),
  );
  await card.filter({ hasText: "Address copied" }).waitFor();
  if (!touch) {
    await card.hover();
    // Longer than the toast duration: hovering must pause the countdown.
    await page.waitForTimeout(2200);
    assert(await card.isVisible());
    await page.getByRole("button", { name: "Open card", exact: true }).hover();
  }
  await card.waitFor({ state: "hidden", timeout: 4000 });
  await press(
    page.getByRole("button", { name: "Stack notifications", exact: true }),
  );
  await page.waitForFunction(
    () => document.querySelectorAll('[data-slot="toast"]').length === 3,
  );
  // Dismiss the stack from its front (newest) card, one at a time.
  if (!touch)
    await page.locator('[data-slot="toast"][data-front="true"]').hover();
  for (let index = 0; index < 3; index++) {
    const dismiss = page
      .locator('[data-slot="toast"][data-front="true"]')
      .getByRole("button", { name: "Dismiss", exact: true });
    if (touch) await dismiss.tap();
    else await dismiss.click();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('[data-slot="toast"]').length === expected,
      2 - index,
    );
  }
  assert.equal(await card.count(), 0);
}
