import { Effect, SubscriptionRef } from "effect";

// Synchronous access for DOM event callbacks, where an Effect cannot be yielded.
export const getRef = SubscriptionRef.getUnsafe;
export const setRef = <A>(ref: SubscriptionRef.SubscriptionRef<A>, value: A) =>
  Effect.runSync(SubscriptionRef.set(ref, value));
export const updateRef = <A>(
  ref: SubscriptionRef.SubscriptionRef<A>,
  update: (current: A) => A,
) => Effect.runSync(SubscriptionRef.update(ref, update));
