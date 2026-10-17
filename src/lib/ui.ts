import { createSignal } from "solid-js";

export type AuthMode = "signin" | "signup";

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  tone: "success" | "error" | "info";
}

const [authMode, setAuthMode] = createSignal<AuthMode | null>(null);
const [walletModalOpen, setWalletModalOpen] = createSignal(false);
const [toasts, setToasts] = createSignal<ToastMessage[]>([]);
const [walletLinkVersion, setWalletLinkVersion] = createSignal(0);
let toastId = 0;

export { authMode, walletModalOpen, walletLinkVersion };

export function openAuth(mode: AuthMode = "signin") {
  setAuthMode(mode);
}

export function closeAuth() {
  setAuthMode(null);
}

export function openWalletModal() {
  setWalletModalOpen(true);
}

export function closeWalletModal() {
  setWalletModalOpen(false);
}

export function noteWalletLinked() {
  setWalletLinkVersion((version) => version + 1);
}

export function showToast(
  title: string,
  options: { body?: string; tone?: ToastMessage["tone"]; duration?: number } = {},
) {
  const id = ++toastId;
  setToasts((current) => [
    ...current,
    { id, title, body: options.body, tone: options.tone ?? "info" },
  ]);
  window.setTimeout(() => dismissToast(id), options.duration ?? 4600);
}

export function dismissToast(id: number) {
  setToasts((current) => current.filter((toast) => toast.id !== id));
}

export { toasts };
