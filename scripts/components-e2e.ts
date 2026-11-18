import solid from "@solidjs/vite-plugin";

import { build, type Rollup } from "vite";
import { showcaseCards } from "../src/lib/preview";
import { strict as assert } from "node:assert";
import { chromium } from "playwright-core";
import { join } from "node:path";
import { checkMoneyAmounts } from "./money-checks";
import { checkToasts } from "./toast-checks";

const root = join(import.meta.dir, "..");
// The harness is Solid JSX, so it is compiled by Vite with the app's plugin.
const built = await build({
  configFile: false,
  root,
  logLevel: "error",
  plugins: [solid()],
  // Library builds leave this for the host page, and the harness has none.
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    write: false,
    minify: false,
    lib: {
      entry: join(root, "tests/frontend-harness.tsx"),
      formats: ["es"],
      fileName: "bundle",
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
const output = (Array.isArray(built) ? built[0] : built) as Rollup.RollupOutput;
const chunk = output.output.find((item) => item.type === "chunk");
if (!chunk || chunk.type !== "chunk")
  throw new Error("Component harness build failed");
const bundle = chunk.code;
const styles = Array.from(
  new Bun.Glob("index-*.css").scanSync(join(root, "dist/client/assets")),
)[0];
if (!styles) throw new Error("Run bun run build before checking components");
const stylesheet = await Bun.file(
  join(root, "dist/client/assets", styles),
).text();
const trades: unknown[] = [];
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/bundle.js")
      return new Response(bundle, {
        headers: { "content-type": "text/javascript" },
      });
    if (path === "/styles.css")
      return new Response(stylesheet, {
        headers: { "content-type": "text/css" },
      });
    if (path === "/api/trades") {
      trades.push(await request.json());
      return Response.json({ ok: true });
    }
    if (path.startsWith("/api/"))
      return Response.json(
        { error: "No wallet/provider in this fixture" },
        { status: 400 },
      );
    return new Response(
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
      { headers: { "content-type": "text/html" } },
    );
  },
});
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  const errors: string[] = [];
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.url.href);
  await checkMoneyAmounts(page);
  await checkToasts(page);
  await page.getByRole("button", { name: "Open card", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  // The dialog traps keyboard focus while it is open.
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    assert(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      ),
    );
  }
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Open card",
  );
  await page.getByRole("button", { name: "Open pack", exact: true }).click();
  await page
    .getByRole("button", { name: "Reveal all cards", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep all 3", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Pack kept" }).waitFor();
  await page.getByRole("button", { name: "Open trade", exact: true }).click();
  await page.getByTestId("trade-choice").first().click();
  await page.getByRole("button", { name: "Send trade offer" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Trade submitted" })
    .waitFor();
  assert.equal(trades.length, 1);
  await page.getByRole("button", { name: "Open wallet", exact: true }).click();
  await page
    .getByRole("heading", { name: "No Solana wallet found." })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // All answers contribute points; the callback must include the final round.
  await page.getByRole("button", { name: "Start the duel" }).click();
  for (let round = 1; round <= 3; round += 1) {
    await page.getByText(`Round ${round} / 3`, { exact: true }).waitFor();
    const buttons = page.getByTestId("duel-option");
    const heading = await page
      .getByTestId("duel-question")
      .locator("h2")
      .innerText();
    const card = showcaseCards().find((candidate) =>
      heading.includes(candidate.description),
    );
    assert(card, "The round describes a fixture card");
    await buttons.filter({ hasText: card.title }).click();
  }
  await page
    .getByRole("status")
    .filter({ hasText: "Duel completed: 750" })
    .waitFor();
  const mobileContext = await browser.newContext({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const mobile = await mobileContext.newPage();
    mobile.setDefaultTimeout(15_000);
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(server.url.href);
    await checkMoneyAmounts(mobile, true);
    await checkToasts(mobile, true);
    await mobile.getByRole("button", { name: "Open pack", exact: true }).tap();
    await mobile.getByRole("dialog").waitFor();
    const reveal = mobile.getByRole("button", {
      name: "Reveal all cards",
      exact: true,
    });
    await reveal.tap({ timeout: 5000 });
    await mobile
      .getByRole("button", { name: "Keep all 3", exact: true })
      .tap({ timeout: 5000 });
    await mobile.getByRole("status").filter({ hasText: "Pack kept" }).waitFor();
    await mobile.getByRole("button", { name: "Open trade", exact: true }).tap();
    await mobile.getByTestId("trade-choice").last().tap({ timeout: 5000 });
    await mobile
      .getByRole("button", { name: "Send trade offer" })
      .tap({ timeout: 5000 });
    await mobile
      .getByRole("status")
      .filter({ hasText: "Trade submitted" })
      .waitFor();
    await mobile.getByRole("button", { name: "Open card", exact: true }).tap();
    await mobile
      .getByRole("link", { name: "Read the Wikipedia article" })
      .scrollIntoViewIfNeeded({ timeout: 5000 });
    assert(
      await mobile
        .getByRole("dialog")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    );
    await mobile.screenshot({ path: ".artifacts/mobile-dialog.png" });
    await mobile.getByRole("button", { name: "Close card", exact: true }).tap();
    await mobile.getByRole("dialog").waitFor({ state: "hidden" });
    console.log(
      "Short-screen touch checks passed: scrollable card, pack and trade dialogs at 320×568.",
    );
    await mobile.emulateMedia({ reducedMotion: "reduce" });
    await mobile.reload();
    await checkMoneyAmounts(mobile, true);
    await checkToasts(mobile, true);
    console.log(
      "Toast checks passed: success/error/info, stack, timed expiry, pause on hover, keyboard/touch dismissal and reduced motion.",
    );
    console.log(
      "Money counters passed: desktop, 320px mobile, reduced motion, decimals, rounding, sign changes and large-value fallback.",
    );
  } finally {
    await mobileContext.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Solid component browser checks passed: modal focus/Escape/restoration, pack reveal, trade submission, wallet fallback, final duel score.",
  );
} finally {
  await browser.close();
  server.stop(true);
}
