import { Context, Effect, Layer, Schema, SubscriptionRef } from "effect";
import { getRef, setRef } from "../runtime/ref";

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

export function isLiquidUiEnabled(
  value: LiquidUiPreferences,
  reducedTransparency: boolean,
) {
  return (
    value.mode === "on" || (value.mode === "system" && !reducedTransparency)
  );
}

function readPreferences(): LiquidUiPreferences {
  try {
    const stored = localStorage.getItem(preferenceKey);
    return stored === null ? DEFAULT_LIQUID_UI : decodePreferences(stored);
  } catch {
    return DEFAULT_LIQUID_UI;
  }
}

export class LiquidUi extends Context.Service<
  LiquidUi,
  {
    readonly preferences: SubscriptionRef.SubscriptionRef<LiquidUiPreferences>;
    /** The device's reduced-transparency setting. */
    readonly reducedTransparency: SubscriptionRef.SubscriptionRef<boolean>;
    readonly update: (
      change: Partial<LiquidUiPreferences>,
    ) => Effect.Effect<void>;
    readonly reset: Effect.Effect<void>;
  }
>()("wikigems/LiquidUi") {
  static readonly layer = Layer.effect(
    LiquidUi,
    Effect.gen(function* () {
      const preferences = yield* SubscriptionRef.make(readPreferences());
      const media = matchMedia("(prefers-reduced-transparency: reduce)");
      const reducedTransparency = yield* SubscriptionRef.make(media.matches);

      const onStorage = (event: StorageEvent) => {
        if (event.key === preferenceKey || event.key === null)
          setRef(preferences, readPreferences());
      };
      const onMedia = () => setRef(reducedTransparency, media.matches);
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          window.addEventListener("storage", onStorage);
          media.addEventListener("change", onMedia);
        }),
        () =>
          Effect.sync(() => {
            window.removeEventListener("storage", onStorage);
            media.removeEventListener("change", onMedia);
          }),
      );

      const update = (change: Partial<LiquidUiPreferences>) =>
        Effect.sync(() => {
          const next = { ...getRef(preferences), ...change };
          setRef(preferences, next);
          try {
            localStorage.setItem(preferenceKey, JSON.stringify(next));
          } catch {
            // Keep changes for this tab when browser storage is unavailable.
          }
        });
      return LiquidUi.of({
        preferences,
        reducedTransparency,
        update,
        reset: update(DEFAULT_LIQUID_UI),
      });
    }),
  );
}
