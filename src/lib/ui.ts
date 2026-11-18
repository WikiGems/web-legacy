import { Effect } from "effect";
import { fromRef, getService } from "../runtime";
import { Toasts, type ToastOptions } from "../services/toasts";
import { Wallet } from "../services/wallet";
import { haptic } from "./haptics";

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

export function showToast(title: string, options: ToastOptions = {}) {
  return Effect.runSync(getService(Toasts).show(title, options));
}

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
    showToast(message.title, { body: message.body, tone: "success" });
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
    showToast(message.title, { body: message.body, tone: "success" });
  } catch {
    /* Restricted storage must not prevent the page from loading. */
  }
}

export const useWalletState = () => fromRef(getService(Wallet).state);
export const openWalletModal = () =>
  Effect.runSync(getService(Wallet).openModal);
export const closeWalletModal = () =>
  Effect.runSync(getService(Wallet).closeModal);
