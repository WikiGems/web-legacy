import { Effect } from "effect";
import { createMemo } from "solid-js";
import { fromRef, getService } from "../runtime";
import { LiquidUi, isLiquidUiEnabled } from "../services/liquid-ui";

export {
  DEFAULT_LIQUID_UI,
  isLiquidUiEnabled,
  type LiquidUiPreferences,
} from "../services/liquid-ui";

export const useLiquidUiPreferences = () =>
  fromRef(getService(LiquidUi).preferences);

export function useLiquidUiEnabled() {
  const preferences = useLiquidUiPreferences();
  const reducedTransparency = fromRef(getService(LiquidUi).reducedTransparency);
  return createMemo(() =>
    isLiquidUiEnabled(preferences(), reducedTransparency()),
  );
}

export const setLiquidUiPreferences = (
  update: Parameters<(typeof LiquidUi)["Service"]["update"]>[0],
) => Effect.runSync(getService(LiquidUi).update(update));
export const resetLiquidUiPreferences = () =>
  Effect.runSync(getService(LiquidUi).reset);
