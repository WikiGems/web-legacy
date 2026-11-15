import { useEffect, useRef } from "react";
import { WebHaptics } from "web-haptics";
import { createStore } from "./store";

// Semantic names keep hardware details out of action handlers.
export const HAPTIC_PATTERNS = {
  selection: [8],
  swap: [18, 35, 18],
  buy: [12, 30, 28],
  sell: [32, 35, 12],
  confirm: [25],
  success: [15, 45, 30],
  warning: [24, 60, 24],
  error: [32, 30, 32, 30, 48],
} satisfies Record<string, number[]>;
export type HapticFeedback = keyof typeof HAPTIC_PATTERNS;
const preferenceKey = "wikigems.haptics";
let sessionPreference: boolean | undefined;

function readPreference(): boolean {
  if (sessionPreference !== undefined) return sessionPreference;
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(preferenceKey);
    if (stored === "on") return true;
    if (stored === "off") return false;
  } catch {
    // Restricted storage still permits an in-memory preference.
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const preference = createStore(readPreference());
export const useHapticsEnabled = preference.useSnapshot;
let engine: WebHaptics | undefined;

function stopHaptics() {
  const current = engine;
  engine = undefined;
  try {
    current?.cancel();
  } catch {
    /* A browser may reject cancellation too. */
  }
  try {
    current?.destroy();
  } catch {
    /* Still attempt every cleanup step. */
  }
}

export function haptic(feedback: HapticFeedback) {
  if (
    !preference.getSnapshot() ||
    typeof document === "undefined" ||
    document.visibilityState !== "visible"
  )
    return;
  try {
    engine ??= new WebHaptics({ debug: false, showSwitch: false });
    // Trigger synchronously inside the press event; async imports lose activation.
    void engine
      .trigger([...HAPTIC_PATTERNS[feedback]], { intensity: 1 })
      .catch(() => {});
  } catch {
    // Haptics supplement visual feedback, including on unsupported browsers.
  }
}

export function setHapticsEnabled(enabled: boolean) {
  sessionPreference = enabled;
  preference.set(() => enabled);
  try {
    window.localStorage.setItem(preferenceKey, enabled ? "on" : "off");
  } catch {
    /* Keep the in-memory setting. */
  }
  if (enabled) haptic("selection");
  else stopHaptics();
}

export function useHapticsLifecycle() {
  useEffect(() => {
    const refresh = () => {
      const enabled = readPreference();
      preference.set(() => enabled);
      if (!enabled) stopHaptics();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) {
        sessionPreference = undefined;
        refresh();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") stopHaptics();
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", stopHaptics);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", stopHaptics);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", refresh);
      stopHaptics();
    };
  }, []);
}

export function useErrorHaptic(error: unknown) {
  const previous = useRef<unknown>(undefined);
  useEffect(() => {
    if (error && error !== previous.current) haptic("error");
    previous.current = error;
  }, [error]);
}
