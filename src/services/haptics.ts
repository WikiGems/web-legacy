import { Context, Effect, Layer, SubscriptionRef } from "effect";
import { WebHaptics } from "web-haptics";
import { getRef, setRef } from "../runtime/ref";

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

export class Haptics extends Context.Service<
  Haptics,
  {
    /** The user's preference, observable by the UI. */
    readonly enabled: SubscriptionRef.SubscriptionRef<boolean>;
    /** Runs synchronously: browsers require activation inside the press event. */
    readonly trigger: (feedback: HapticFeedback) => Effect.Effect<void>;
    readonly setEnabled: (enabled: boolean) => Effect.Effect<void>;
  }
>()("wikigems/Haptics") {
  static readonly layer = Layer.effect(
    Haptics,
    Effect.gen(function* () {
      let sessionPreference: boolean | undefined;
      let engine: WebHaptics | undefined;

      const readPreference = (): boolean => {
        if (sessionPreference !== undefined) return sessionPreference;
        try {
          const stored = window.localStorage.getItem(preferenceKey);
          if (stored === "on") return true;
          if (stored === "off") return false;
        } catch {
          // Restricted storage still permits an in-memory preference.
        }
        return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      };

      const enabled = yield* SubscriptionRef.make(readPreference());

      const stop = () => {
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
      };

      const fire = (feedback: HapticFeedback) => {
        if (!getRef(enabled) || document.visibilityState !== "visible") return;
        try {
          engine ??= new WebHaptics({ debug: false, showSwitch: false });
          void engine
            .trigger([...HAPTIC_PATTERNS[feedback]], { intensity: 1 })
            .catch(() => {});
        } catch {
          // Haptics supplement visual feedback, including on unsupported browsers.
        }
      };

      // Keep the preference, hardware and tab visibility in step for the
      // lifetime of the runtime.
      const refresh = () => {
        const next = readPreference();
        setRef(enabled, next);
        if (!next) stop();
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key === preferenceKey || event.key === null) {
          sessionPreference = undefined;
          refresh();
        }
      };
      const onVisibility = () => {
        if (document.visibilityState !== "visible") stop();
      };
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          window.addEventListener("storage", onStorage);
          window.addEventListener("pagehide", stop);
          document.addEventListener("visibilitychange", onVisibility);
          motion.addEventListener("change", refresh);
        }),
        () =>
          Effect.sync(() => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("pagehide", stop);
            document.removeEventListener("visibilitychange", onVisibility);
            motion.removeEventListener("change", refresh);
            stop();
          }),
      );

      return Haptics.of({
        enabled,
        trigger: (feedback) => Effect.sync(() => fire(feedback)),
        setEnabled: (next) =>
          Effect.sync(() => {
            sessionPreference = next;
            setRef(enabled, next);
            try {
              window.localStorage.setItem(preferenceKey, next ? "on" : "off");
            } catch {
              /* Keep the in-memory setting. */
            }
            if (next) fire("selection");
            else stop();
          }),
      });
    }),
  );
}
