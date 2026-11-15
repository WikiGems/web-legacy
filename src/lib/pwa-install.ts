import { createStore } from "./store";

type Choice = { outcome: "accepted" | "dismissed" };
interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<Choice>;
}
type Availability =
  | { kind: "unavailable" | "manual" | "accepted" | "installed" }
  | { kind: "ready" | "prompting"; event: InstallEvent };

const installedKey = "wikigems.pwa.installed";
const dismissedKey = "wikigems.pwa.dismissed";
const install = createStore<{ availability: Availability; dismissed: boolean }>(
  {
    availability: { kind: "unavailable" },
    dismissed: false,
  },
);
export const usePwaInstall = install.useSnapshot;

function standalone() {
  return (
    window.matchMedia("(display-mode: standalone), (display-mode: minimal-ui)")
      .matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}
function read(storage: Storage, key: string) {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function rememberInstalled() {
  try {
    localStorage.setItem(installedKey, "1");
  } catch {
    /* Optional device-local hint. */
  }
  install.set(() => ({
    availability: { kind: "installed" },
    dismissed: false,
  }));
}
function isInstallEvent(event: Event): event is InstallEvent {
  return (
    "prompt" in event &&
    typeof event.prompt === "function" &&
    "userChoice" in event &&
    event.userChoice instanceof Promise
  );
}

// Capture before React mounts so an early browser event is retained. The native
// browser promotion remains enabled: deliberately do not preventDefault here.
export function startPwaInstall() {
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  )
    return () => {};
  let dismissed = false;
  let previouslyInstalled = false;
  try {
    dismissed = read(sessionStorage, dismissedKey);
    previouslyInstalled = read(localStorage, installedKey);
  } catch {
    /* Access to the Storage object itself may be restricted. */
  }
  install.set(() => ({
    availability: {
      kind: standalone() || previouslyInstalled ? "installed" : "manual",
    },
    dismissed,
  }));
  const mode = window.matchMedia(
    "(display-mode: standalone), (display-mode: minimal-ui)",
  );
  const onMode = () => {
    if (standalone()) rememberInstalled();
  };
  const onInstalled = () => rememberInstalled();
  const onPrompt = (event: Event) => {
    if (!isInstallEvent(event) || standalone()) return;
    // A new browser event is evidence that an earlier installation was removed.
    try {
      localStorage.removeItem(installedKey);
    } catch {
      /* Best effort. */
    }
    install.set((state) => ({
      ...state,
      availability: { kind: "ready", event },
    }));
    void event.userChoice
      .then(({ outcome }) => {
        const current = install.getSnapshot().availability;
        if (
          (current.kind !== "ready" && current.kind !== "prompting") ||
          current.event !== event
        )
          return;
        if (outcome === "dismissed") dismissInstallOffer();
        install.set((state) => ({
          ...state,
          availability: {
            kind: outcome === "accepted" ? "accepted" : "manual",
          },
        }));
      })
      .catch(() => {
        const current = install.getSnapshot().availability;
        if (
          (current.kind === "ready" || current.kind === "prompting") &&
          current.event === event
        )
          install.set((state) => ({
            ...state,
            availability: { kind: "manual" },
          }));
      });
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  mode.addEventListener("change", onMode);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    mode.removeEventListener("change", onMode);
  };
}

export function dismissInstallOffer() {
  install.set((state) => ({ ...state, dismissed: true }));
  try {
    sessionStorage.setItem(dismissedKey, "1");
  } catch {
    /* Keep the in-memory dismissal. */
  }
}

export async function requestPwaInstall(): Promise<
  "accepted" | "dismissed" | "manual"
> {
  const current = install.getSnapshot().availability;
  if (current.kind !== "ready") return "manual";
  install.set((state) => ({
    ...state,
    availability: { kind: "prompting", event: current.event },
  }));
  try {
    // This call stays synchronous within the click; await only after prompting.
    await current.event.prompt();
    const result = await current.event.userChoice;
    return result.outcome;
  } catch {
    if (install.getSnapshot().availability.kind !== "installed")
      install.set((state) => ({ ...state, availability: { kind: "manual" } }));
    return "manual";
  }
}

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
