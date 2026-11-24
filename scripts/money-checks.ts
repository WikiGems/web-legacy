import { strict as assert } from "node:assert";
import type { Page } from "playwright-core";

export async function checkMoneyAmounts(page: Page, touch = false) {
  const preview = page.getByTestId("money-preview");
  const amount = preview.locator('[data-slot="money-amount"]');
  const values = [
    "0.40",
    "1,000.01",
    "0.00",
    "0.000001",
    "1.01",
    "18,446,744,073,709.551615",
  ];
  for (const [index, value] of values.entries()) {
    if (index > 0) {
      const button = page.getByRole("button", {
        name: "Change amount",
        exact: true,
      });
      if (touch) await button.tap();
      else await button.click();
    }
    await preview.getByText(`$${value}`, { exact: true }).waitFor();
    const accessible = await amount.ariaSnapshot();
    assert(
      accessible.includes(`$${value}`),
      "Read the complete amount once, without wheel digits",
    );
    assert(
      !accessible.includes("0123456789"),
      "Digit wheels are hidden from screen readers",
    );
    assert(
      await amount.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.width <= innerWidth;
      }),
      `${value} fits the viewport`,
    );
  }
  assert.equal(
    await preview.locator('[data-slot="animated-counter"]').count(),
    0,
    "Large amounts keep their exact formatted value instead of being clamped by the counter",
  );
}
