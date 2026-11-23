import type { Context } from "effect";
import { Effect, Layer, ManagedRuntime } from "effect";
import { Api } from "@wikigems/client";
import { Auth } from "../services/auth";
import { Avatars } from "../services/avatars";
import { Haptics } from "../services/haptics";
import { LiquidUi } from "../services/liquid-ui";
import { PwaInstall } from "../services/pwa-install";
import { Toasts } from "../services/toasts";
import { Wallet } from "../services/wallet";

/**
 * Every browser capability is an Effect service, wired once here. Components
 * reach them through the helpers in this folder; tests may swap any layer.
 */
export const AppLayer = Layer.mergeAll(
  Api.layer({
    baseURL: window.location.origin,
    fetch: globalThis.fetch.bind(globalThis),
  }),
  Auth.layer,
  Avatars.layer,
  LiquidUi.layer,
  PwaInstall.layer,
  Toasts.layer,
  Wallet.layer,
).pipe(Layer.provideMerge(Haptics.layer));

export type AppServices = Layer.Success<typeof AppLayer>;

export const runtime = ManagedRuntime.make(AppLayer);

/**
 * Starts the runtime so lifecycle layers (install capture, storage sync,
 * haptics cleanup) are live before the first render.
 */
export const startRuntime = () => {
  runtime.runSync(Effect.void);
  return () => void runtime.dispose();
};

const resolved = new Map<unknown, unknown>();

/** Synchronously resolves a service. Layers are synchronous, so this is safe. */
export const getService = <I, S>(tag: Context.Service<I, S>): S => {
  if (!resolved.has(tag))
    resolved.set(
      tag,
      runtime.runSync(tag.use((service) => Effect.succeed(service)) as never),
    );
  return resolved.get(tag) as S;
};
