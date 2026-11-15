import type { Page } from "playwright-core";

// Expose the same destination through either responsive navigation layout.
export async function sectionLink(page: Page, name: string, touch = false) {
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.waitFor();
  const link = nav.getByRole("link", { name, exact: true });
  if (await link.isVisible()) return link;
  const more = nav.getByRole("button", { name: "More sections", exact: true });
  if (touch) await more.tap();
  else await more.click();
  return page
    .getByRole("dialog", { name: "More sections", exact: true })
    .getByRole("link", { name, exact: true });
}
