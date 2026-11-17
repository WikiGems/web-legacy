import type { Locator } from "playwright-core";

/**
 * Init script that makes Chromium report no SVG `backdrop-filter` support, so
 * LiquidGlass takes the same frosted path as WebKit and Gecko.
 */
export const forceFrostedGlass = `(() => {
  const supports = CSS.supports.bind(CSS);
  CSS.supports = (...args) =>
    !args.join(" ").includes("url(") && supports(...args);
})()`;

export function backdropFilter(glass: Locator) {
  return glass.evaluate((element) => getComputedStyle(element).backdropFilter);
}

/** The SVG filter LiquidGlass refracts through, or null. */
export function refractionFilterId(glass: Locator) {
  return glass.evaluate(
    (element) => element.querySelector(":scope > svg filter")?.id ?? null,
  );
}
