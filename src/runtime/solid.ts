import { Effect, Fiber, Stream, SubscriptionRef } from "effect";
import {
  createMemo,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  type Accessor,
  type Refreshable,
} from "solid-js";
import { runtime, type AppServices } from "./runtime";

/**
 * Reads a SubscriptionRef reactively. The signal follows every change, and the
 * subscription ends with the owner that created it.
 */
export function fromRef<A>(
  ref: SubscriptionRef.SubscriptionRef<A>,
): Accessor<A> {
  // Boxed, so a state that is itself a function is not mistaken for a
  // derived signal.
  const [box, setBox] = createSignal({
    current: SubscriptionRef.getUnsafe(ref),
  });
  const owner = getOwner();
  // The ref replays its current value as soon as the stream starts. Start it
  // detached, so that first write is not made from inside the owner's scope.
  const fiber = runWithOwner(null, () =>
    runtime.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (next) =>
        Effect.sync(() => setBox(() => ({ current: next }))),
      ),
    ),
  );
  if (owner && fiber)
    onCleanup(() => void Effect.runFork(Fiber.interrupt(fiber)));
  return () => box().current;
}

/**
 * An async computation backed by an Effect. Reading it suspends the nearest
 * `<Loading>` and a failure reaches the nearest `<Errored>`. When its inputs
 * change or its owner is disposed, the request is aborted.
 */
export function createAsync<A, E>(
  effect: () => Effect.Effect<A, E, AppServices>,
): Refreshable<Accessor<A>> {
  return createMemo(() => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    return runtime.runPromise(effect(), { signal: controller.signal });
  });
}

export type UiResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false };

/**
 * Runs an Effect from an event handler. A typed failure goes to `onFailure`
 * and resolves `{ ok: false }`; only defects escape, and those are logged
 * rather than left as unhandled rejections. The promise never rejects.
 */
export function runUi<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  onFailure?: (error: E) => void,
): Promise<UiResult<A>> {
  return runtime
    .runPromise(
      effect.pipe(
        Effect.map((value): UiResult<A> => ({ ok: true, value })),
        Effect.catch((error) =>
          Effect.sync((): UiResult<A> => {
            onFailure?.(error);
            return { ok: false };
          }),
        ),
      ),
    )
    .catch((defect: unknown): UiResult<A> => {
      console.error(defect);
      return { ok: false };
    });
}
