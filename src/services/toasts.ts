import { Context, Effect, Layer, SubscriptionRef } from "effect";
import { Haptics } from "./haptics";

export type ToastTone = "success" | "error" | "info";
export interface ToastItem {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly tone: ToastTone;
  /** Milliseconds before dismissal; Infinity keeps the toast until dismissed. */
  readonly duration: number;
}
export interface ToastOptions {
  body?: string;
  tone?: ToastTone;
  duration?: number;
}

export class Toasts extends Context.Service<
  Toasts,
  {
    readonly items: SubscriptionRef.SubscriptionRef<ReadonlyArray<ToastItem>>;
    readonly show: (
      title: string,
      options?: ToastOptions,
    ) => Effect.Effect<number>;
    readonly dismiss: (id: number) => Effect.Effect<void>;
  }
>()("wikigems/Toasts") {
  static readonly layer = Layer.effect(
    Toasts,
    Effect.gen(function* () {
      const haptics = yield* Haptics;
      const items = yield* SubscriptionRef.make<ReadonlyArray<ToastItem>>([]);
      let nextId = 1;
      return Toasts.of({
        items,
        show: Effect.fnUntraced(function* (title, options = {}) {
          const tone = options.tone ?? "info";
          if (tone === "error" || tone === "success")
            yield* haptics.trigger(tone);
          const id = nextId++;
          yield* SubscriptionRef.update(items, (current) => [
            ...current,
            {
              id,
              title,
              description: options.body,
              tone,
              duration: options.duration ?? 4600,
            },
          ]);
          return id;
        }),
        dismiss: (id) =>
          SubscriptionRef.update(items, (current) =>
            current.filter((item) => item.id !== id),
          ),
      });
    }),
  );
}
