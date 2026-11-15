import { useEffect, type RefObject } from "react";
import type { LiquidGlassLens } from "liquid-gl";
import {
  getLiquidUiPreferences,
  isLiquidUiEnabled,
  subscribeLiquidUiPreferences,
  type LiquidUiPreferences,
} from "./liquid-ui";

function mountGlass({
  surface,
  panel,
  content,
  initialPreferences,
  scope,
}: {
  surface: HTMLElement;
  panel: HTMLElement;
  content: HTMLElement;
  initialPreferences: LiquidUiPreferences;
  scope: "navigation" | "listings";
}) {
  let preferences = initialPreferences;
  const events = new AbortController();
  const mutations = new MutationObserver(() => scheduleRefresh());
  const theme = new MutationObserver(() => scheduleRefresh());
  const size = new ResizeObserver(() => scheduleRefresh());
  const position = new MutationObserver(() => clipCanvas());
  const panelSize = new ResizeObserver(() => clipCanvas());
  let lenses: LiquidGlassLens[] = [];
  let stopped = false;
  let refreshing = false;
  let dirty = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let clipFrame = 0;

  function clipCanvas() {
    if (scope === "listings") return;
    const canvas = lenses[0]?.renderer?.canvas;
    if (stopped || !canvas || panel.contains(canvas)) return;
    // Keep the panel's material stable through its exit animation; dispose on unmount.
    if (panel.dataset.exiting === "true") {
      canvas.style.clipPath = "inset(50%)";
      cancelAnimationFrame(clipFrame);
      return;
    }
    const rect = panel.getBoundingClientRect();
    const origin = canvas.getBoundingClientRect();
    const radius = getComputedStyle(panel).borderRadius;
    canvas.style.clipPath = `inset(${rect.top - origin.top}px ${origin.right - rect.right}px ${origin.bottom - rect.bottom}px ${rect.left - origin.left}px round ${radius})`;
    cancelAnimationFrame(clipFrame);
    if (panel.dataset.entering === "true") {
      clipFrame = requestAnimationFrame(clipCanvas);
    }
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(startupTimer);
    clearTimeout(refreshTimer);
    cancelAnimationFrame(clipFrame);
    events.abort();
    mutations.disconnect();
    theme.disconnect();
    size.disconnect();
    position.disconnect();
    panelSize.disconnect();
    lenses.forEach((lens) => lens.destroy());
    panel.removeAttribute("data-glass");
  };

  async function refresh() {
    const renderer = lenses[0]?.renderer;
    if (
      stopped ||
      refreshing ||
      !renderer ||
      panel.dataset.glass !== "ready"
    ) {
      return;
    }
    if (renderer._capturing) {
      scheduleRefresh();
      return;
    }
    refreshing = true;
    dirty = false;
    try {
      // liquidGL 3.0.0 exposes captureSnapshot on its renderer, not its lens.
      if ((await renderer.captureSnapshot()) === false) stop();
    } catch {
      stop();
    } finally {
      refreshing = false;
      if (dirty && !stopped) scheduleRefresh();
    }
  }

  function scheduleRefresh() {
    if (stopped) return;
    dirty = true;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), 180);
  }

  panel.dataset.glass = "loading";
  startupTimer = setTimeout(stop, 10_000);

  void import("liquid-gl")
    .then(({ default: liquidGL }) => {
      if (stopped) return;
      const zIndex = Number.parseInt(getComputedStyle(panel).zIndex, 10);
      const instance = liquidGL({
        target:
          scope === "navigation"
            ? `#${CSS.escape(surface.id)}`
            : `#${CSS.escape(surface.id)} .listing-glass`,
        snapshot:
          scope === "navigation" ? ".app-content" : `#${CSS.escape(surface.id)}`,
        engine: "auto",
        zIndex: scope === "listings" ? 2 : Number.isFinite(zIndex) ? zIndex : 0,
        resolution: 1,
        refraction: preferences.refraction / 5000,
        aberration: 0.005,
        bevelDepth: 0.08,
        bevelWidth: 0.18,
        frost: 0,
        shadow: false,
        specular: true,
        reveal: "none",
        content: false,
        on: {
          init(readyLens) {
            if (stopped) return;
            clearTimeout(startupTimer);
            clipCanvas();
            panel.dataset.glass = "ready";
            const backend = readyLens.renderer?.backend;
            if (backend?.kind === "webgpu") {
              void backend.device.lost.then(stop);
            }
            if (dirty) scheduleRefresh();
          },
        },
      });
      lenses = Array.isArray(instance) ? instance : instance ? [instance] : [];
      const renderer = lenses[0]?.renderer;
      if (!renderer) {
        stop();
        return;
      }
      renderer.canvas.setAttribute("aria-hidden", "true");
      renderer.canvas.addEventListener("webglcontextlost", stop, {
        signal: events.signal,
      });
      position.observe(panel, {
        attributes: true,
        attributeFilter: ["style", "data-entering", "data-exiting"],
      });
      panelSize.observe(panel);
      window.addEventListener("scroll", clipCanvas, {
        capture: true,
        signal: events.signal,
      });
      window.addEventListener("resize", clipCanvas, { signal: events.signal });
      mutations.observe(content, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "src", "hidden", "value"],
      });
      theme.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      size.observe(content);
      for (const event of ["load", "error", "input", "change"]) {
        content.addEventListener(event, scheduleRefresh, {
          capture: true,
          signal: events.signal,
        });
      }
      document.fonts.addEventListener("loadingdone", scheduleRefresh, {
        signal: events.signal,
      });
    })
    .catch(stop);

  return {
    stop,
    update(next: LiquidUiPreferences) {
      preferences = next;
      if (!stopped) {
        lenses.forEach((lens) => {
          lens.options.refraction = next.refraction / 5000;
        });
      }
    },
  };
}

function useLiquidGlass(
  ref: RefObject<HTMLElement | null>,
  scope: "navigation" | "listings",
) {
  useEffect(() => {
    const surface = ref.current;
    const panel = scope === "listings" ? surface : surface?.parentElement;
    const content =
      scope === "listings"
        ? surface
        : document.querySelector<HTMLElement>(".app-content");
    if (!surface || !panel || !content) return;

    const mobile = matchMedia("(width < 48rem)");
    const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
    let active: ReturnType<typeof mountGlass> | undefined;
    const sync = () => {
      const preferences = getLiquidUiPreferences();
      const enabled = isLiquidUiEnabled(preferences, transparency.matches);
      panel.dataset.liquidUi = enabled ? "on" : "off";
      panel.style.setProperty("--liquid-ui-opacity", `${preferences.opacity}%`);
      panel.style.setProperty("--liquid-ui-blur", `${preferences.blur}px`);
      if (
        (scope === "listings" || mobile.matches) &&
        enabled &&
        !document.hidden
      ) {
        active ??= mountGlass({
          surface,
          panel,
          content,
          initialPreferences: preferences,
          scope,
        });
        active.update(preferences);
      } else {
        active?.stop();
        active = undefined;
      }
    };
    const unsubscribe = subscribeLiquidUiPreferences(sync);
    mobile.addEventListener("change", sync);
    transparency.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      mobile.removeEventListener("change", sync);
      transparency.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      unsubscribe();
      active?.stop();
      panel.removeAttribute("data-liquid-ui");
      panel.style.removeProperty("--liquid-ui-opacity");
      panel.style.removeProperty("--liquid-ui-blur");
    };
  }, [ref, scope]);
}

export function useNavigationGlass(ref: RefObject<HTMLDivElement | null>) {
  useLiquidGlass(ref, "navigation");
}

export function useListingGlass(ref: RefObject<HTMLElement | null>) {
  useLiquidGlass(ref, "listings");
}
