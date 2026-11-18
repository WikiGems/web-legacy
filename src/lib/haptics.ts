import { Effect } from "effect";
import { createEffect } from "solid-js";
import type { Accessor } from "solid-js";
import { fromRef, getService } from "../runtime";
import {
  Haptics,
  HAPTIC_PATTERNS,
  type HapticFeedback,
} from "../services/haptics";

export { HAPTIC_PATTERNS, type HapticFeedback };

/** Fires synchronously: browsers only allow haptics inside the press event. */
export function haptic(feedback: HapticFeedback) {
  Effect.runSync(getService(Haptics).trigger(feedback));
}

export const useHapticsEnabled = () => fromRef(getService(Haptics).enabled);

export function setHapticsEnabled(enabled: boolean) {
  Effect.runSync(getService(Haptics).setEnabled(enabled));
}

/** Gives one error tap per new error, however often the page re-renders. */
export function useErrorHaptic(error: Accessor<unknown>) {
  createEffect(error, (current, previous) => {
    if (current && current !== previous) haptic("error");
  });
}
