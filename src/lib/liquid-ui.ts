import { Schema } from "effect";
import { useEffect, useSyncExternalStore } from "react";
import { createStore } from "./store";

const percent = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 100 }),
);
const preferencesSchema = Schema.Struct({
  mode: Schema.Literals(["system", "on", "off"]),
  refraction: percent,
  blur: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 })),
  opacity: percent,
});
export type LiquidUiPreferences = typeof preferencesSchema.Type;
export const DEFAULT_LIQUID_UI: LiquidUiPreferences = {
  mode: "system",
  refraction: 50,
  blur: 8,
  opacity: 58,
};
const preferenceKey = "wikigems.liquid-ui";
const decodePreferences = Schema.decodeUnknownSync(
  Schema.fromJsonString(preferencesSchema),
);

function readPreferences(): LiquidUiPreferences {
  if (typeof window === "undefined") return DEFAULT_LIQUID_UI;
  try {
    const stored = localStorage.getItem(preferenceKey);
    return stored === null ? DEFAULT_LIQUID_UI : decodePreferences(stored);
  } catch {
    return DEFAULT_LIQUID_UI;
  }
}

const preferences = createStore(readPreferences());
export const useLiquidUiPreferences = preferences.useSnapshot;
export const getLiquidUiPreferences = preferences.getSnapshot;
export const subscribeLiquidUiPreferences = preferences.subscribe;

export function isLiquidUiEnabled(
  value: LiquidUiPreferences,
  reducedTransparency: boolean,
) {
  return (
    value.mode === "on" || (value.mode === "system" && !reducedTransparency)
  );
}

const readReducedTransparency = () =>
  typeof window !== "undefined" &&
  matchMedia("(prefers-reduced-transparency: reduce)").matches;
const subscribeReducedTransparency = (listener: () => void) => {
  const media = matchMedia("(prefers-reduced-transparency: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

export function useLiquidUiEnabled() {
  const value = useLiquidUiPreferences();
  const reducedTransparency = useSyncExternalStore(
    subscribeReducedTransparency,
    readReducedTransparency,
    readReducedTransparency,
  );
  return isLiquidUiEnabled(value, reducedTransparency);
}

export function setLiquidUiPreferences(update: Partial<LiquidUiPreferences>) {
  const next = { ...preferences.getSnapshot(), ...update };
  preferences.set(() => next);
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(next));
  } catch {
    // Keep changes for this tab when browser storage is unavailable.
  }
}

export function resetLiquidUiPreferences() {
  setLiquidUiPreferences(DEFAULT_LIQUID_UI);
}

export function useLiquidUiLifecycle() {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) {
        preferences.set(readPreferences);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
