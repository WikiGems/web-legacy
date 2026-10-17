import { For } from "solid-js";
import { dismissToast, toasts } from "../lib/ui";
import { Icon } from "./Icon";

export function ToastHost() {
  return (
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      <For each={toasts()}>
        {(toast) => (
          <div class="toast" classList={{ [`toast--${toast.tone}`]: true }}>
            <span class="toast-icon">
              <Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "close" : "spark"} size={16} />
            </span>
            <div>
              <p class="toast-title">{toast.title}</p>
              {toast.body && <p class="toast-body">{toast.body}</p>}
            </div>
            <button class="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
