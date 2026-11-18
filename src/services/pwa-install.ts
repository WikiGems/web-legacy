import { Context, Effect, Layer, SubscriptionRef } from "effect";
import { getRef, setRef, updateRef } from "../runtime/ref";

type Choice = { outcome: "accepted" | "dismissed" };
interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<Choice>;
}
export type InstallAvailability =
  | { kind: "unavailable" | "manual" | "accepted" | "installed" }
  | { kind: "ready" | "prompting"; event: InstallEvent };
export interface InstallState {
  availability: InstallAvailability;
  dismissed: boolean;
}

const installedKey = "wikigems.pwa.installed";
const dismissedKey = "wikigems.pwa.dismissed";

const standalone = () =>
  window.matchMedia("(display-mode: standalone), (display-mode: minimal-ui)")
    .matches ||
  ("standalone" in navigator && navigator.standalone === true);
const read = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const isInstallEvent = (event: Event): event is InstallEvent =>
  "prompt" in event &&
  typeof event.prompt === "function" &&
  "userChoice" in event &&
  event.userChoice instanceof Promise;

export function installPlatform(): "ios" | "mac-safari" | "browser" {
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
    return "ios";
  if (
    /Mac/.test(navigator.platform) &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent)
  )
    return "mac-safari";
  return "browser";
}

export class PwaInstall extends Context.Service<
  PwaInstall,
  {
    readonly state: SubscriptionRef.SubscriptionRef<InstallState>;
    readonly dismissOffer: Effect.Effect<void>;
    /** Prompts when the browser offered one; otherwise asks for manual steps. */
    readonly request: Effect.Effect<"accepted" | "dismissed" | "manual">;
  }
>()("wikigems/PwaInstall") {
  static readonly layer = Layer.effect(
    PwaInstall,
    Effect.gen(function* () {
      const state = yield* SubscriptionRef.make<InstallState>({
        availability: { kind: "unavailable" },
        dismissed: false,
      });

      const update = (change: (current: InstallState) => InstallState) =>
        updateRef(state, change);
      const dismissOffer = Effect.sync(() => {
        update((current) => ({ ...current, dismissed: true }));
        try {
          sessionStorage.setItem(dismissedKey, "1");
        } catch {
          /* Keep the in-memory dismissal. */
        }
      });

      // Capture install events from the moment the runtime starts, so an early
      // browser event is retained. The native browser promotion remains
      // enabled: deliberately do not preventDefault here.
      const supported =
        import.meta.env.PROD &&
        window.isSecureContext &&
        "serviceWorker" in navigator;
      if (supported) {
        let dismissed = false;
        let previouslyInstalled = false;
        try {
          dismissed = read(sessionStorage, dismissedKey);
          previouslyInstalled = read(localStorage, installedKey);
        } catch {
          /* Access to the Storage object itself may be restricted. */
        }
        setRef(state, {
          availability: {
            kind: standalone() || previouslyInstalled ? "installed" : "manual",
          },
          dismissed,
        });
        const mode = window.matchMedia(
          "(display-mode: standalone), (display-mode: minimal-ui)",
        );
        const rememberInstalled = () => {
          try {
            localStorage.setItem(installedKey, "1");
          } catch {
            /* Optional device-local hint. */
          }
          setRef(state, { availability: { kind: "installed" }, dismissed: false });
        };
        const onMode = () => {
          if (standalone()) rememberInstalled();
        };
        const isOurs = (event: InstallEvent) => {
          const current = getRef(state).availability;
          return (
            (current.kind === "ready" || current.kind === "prompting") &&
            current.event === event
          );
        };
        const onPrompt = (event: Event) => {
          if (!isInstallEvent(event) || standalone()) return;
          // A new browser event is evidence that an earlier installation was removed.
          try {
            localStorage.removeItem(installedKey);
          } catch {
            /* Best effort. */
          }
          update((current) => ({
            ...current,
            availability: { kind: "ready", event },
          }));
          void event.userChoice
            .then(({ outcome }) => {
              if (!isOurs(event)) return;
              if (outcome === "dismissed") Effect.runSync(dismissOffer);
              update((current) => ({
                ...current,
                availability: {
                  kind: outcome === "accepted" ? "accepted" : "manual",
                },
              }));
            })
            .catch(() => {
              if (isOurs(event))
                update((current) => ({
                  ...current,
                  availability: { kind: "manual" },
                }));
            });
        };
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            window.addEventListener("beforeinstallprompt", onPrompt);
            window.addEventListener("appinstalled", rememberInstalled);
            mode.addEventListener("change", onMode);
          }),
          () =>
            Effect.sync(() => {
              window.removeEventListener("beforeinstallprompt", onPrompt);
              window.removeEventListener("appinstalled", rememberInstalled);
              mode.removeEventListener("change", onMode);
            }),
        );
      }

      const request = Effect.suspend(() => {
        const current = getRef(state).availability;
        if (current.kind !== "ready")
          return Effect.succeed("manual" as const);
        update((value) => ({
          ...value,
          availability: { kind: "prompting", event: current.event },
        }));
        // prompt() stays synchronous within the click; await only afterwards.
        return Effect.tryPromise({
          try: async () => {
            await current.event.prompt();
            return (await current.event.userChoice).outcome;
          },
          catch: () => "manual" as const,
        }).pipe(
          Effect.catch((fallback) =>
            Effect.sync(() => {
              if (getRef(state).availability.kind !== "installed")
                update((value) => ({
                  ...value,
                  availability: { kind: "manual" },
                }));
              return fallback;
            }),
          ),
        );
      });

      return PwaInstall.of({ state, dismissOffer, request });
    }),
  );
}
