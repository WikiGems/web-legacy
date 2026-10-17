import { createSignal } from "solid-js";

export type AuthMode = "signin" | "signup";

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  tone: "success" | "error" | "info";
}

const [authMode, setAuthMode] = createSignal<AuthMode | null>(null);
const [toasts, setToasts] = createSignal<ToastMessage[]>([]);
let toastId = 0;

export { authMode };

export function openAuth(mode: AuthMode = "signin") {
  setAuthMode(mode);
}

export function closeAuth() {
  setAuthMode(null);
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
  window.setTimeout(() => dismissToast(id), options.duration ?? 4200);
}

export function dismissToast(id: number) {
  setToasts((current) => current.filter((toast) => toast.id !== id));
}

export { toasts };
