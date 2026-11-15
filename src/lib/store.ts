import { useSyncExternalStore } from "react";

// Snapshots keep their identity until an event changes the store.
export function createStore<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const getSnapshot = () => snapshot;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    getSnapshot,
    subscribe,
    set(update: (current: T) => T) {
      snapshot = update(snapshot);
      listeners.forEach((listener) => listener());
    },
    useSnapshot: () =>
      useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  };
}
