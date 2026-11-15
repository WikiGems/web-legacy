import { haptic } from "./haptics";
import { createStore } from "./store";
import { toast } from "../components/ui/toast";

const authToastKey = "wikigems.auth-toast";
const authMessages = {
  "sign-in": {
    title: "Welcome back, collector",
    body: "Your album is waiting.",
  },
  "sign-up": {
    title: "Collector card created",
    body: "Your passkey is on this device. No password, ever.",
  },
};

// Auth changes deliberately reload the page to clear the previous account's state.
// Carry only a short-lived message kind, never account data or credentials.
export function queueAuthToast(kind: keyof typeof authMessages) {
  haptic("success");
  try {
    sessionStorage.setItem(
      authToastKey,
      JSON.stringify({ kind, expiresAt: Date.now() + 30_000 }),
    );
  } catch {
    const message = authMessages[kind];
    toast.success(message.title, { description: message.body });
  }
}

export function restoreAuthToast() {
  try {
    const stored = sessionStorage.getItem(authToastKey);
    sessionStorage.removeItem(authToastKey);
    if (!stored) return;
    const value: unknown = JSON.parse(stored);
    if (
      !value ||
      typeof value !== "object" ||
      !("kind" in value) ||
      (value.kind !== "sign-in" && value.kind !== "sign-up") ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt < Date.now() ||
      value.expiresAt > Date.now() + 30_000
    )
      return;
    const message = authMessages[value.kind];
    toast.success(message.title, { description: message.body });
  } catch {
    /* Restricted storage must not prevent the page from loading. */
  }
}

const ui = createStore({ walletModalOpen: false });
export const useUi = ui.useSnapshot;
export function openWalletModal() {
  ui.set((state) => ({ ...state, walletModalOpen: true }));
}
export function closeWalletModal() {
  ui.set((state) => ({ ...state, walletModalOpen: false }));
}
export function showToast(
  title: string,
  options: {
    body?: string;
    tone?: "success" | "error" | "info";
    duration?: number;
  } = {},
) {
  if (options.tone === "error" || options.tone === "success")
    haptic(options.tone);
  return toast[options.tone ?? "info"](title, {
    description: options.body,
    duration: options.duration ?? 4600,
  });
}
