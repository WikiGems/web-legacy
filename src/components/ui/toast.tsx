import { createMemo, For, onSettled, Show } from "solid-js";
import { Portal } from "@solidjs/web";
import { Effect } from "effect";
import { fromRef, getService } from "../../runtime";
import { Toasts, type ToastItem } from "../../services/toasts";
import { Icon, type IconName } from "../Icon";

const tones: Record<ToastItem["tone"], IconName> = {
  success: "check",
  error: "warning",
  info: "info",
};

function ToastCard(props: {
  item: ToastItem;
  front: boolean;
  onDismiss: () => void;
}) {
  let remaining = props.item.duration;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    if (!Number.isFinite(remaining) || timer !== undefined) return;
    startedAt = Date.now();
    timer = setTimeout(props.onDismiss, remaining);
  };
  // Hovering or focusing a toast holds its countdown.
  const pause = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    remaining -= Date.now() - startedAt;
  };
  onSettled(() => {
    start();
    return () => clearTimeout(timer);
  });
  return (
    <li
      data-slot="toast"
      data-type={props.item.tone}
      data-front={props.front ? "true" : "false"}
      class="toast-card pointer-events-auto flex items-start gap-3 rounded-2xl border border-base-300 bg-base-100 p-2.5 pr-1 shadow-lg"
      onPointerEnter={pause}
      onPointerLeave={start}
      onFocusIn={pause}
      onFocusOut={start}
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-base-content text-base-100">
        <Icon name={tones[props.item.tone]} size={18} />
      </span>
      <div
        class="min-w-0 flex-1 py-1"
        role={props.item.tone === "error" ? "alert" : "status"}
      >
        <p class="text-sm font-medium">{props.item.title}</p>
        <Show when={props.item.description}>
          <p class="mt-0.5 text-xs leading-relaxed text-muted">
            {props.item.description}
          </p>
        </Show>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        class="btn btn-ghost btn-circle min-h-11 min-w-11 shrink-0"
        onClick={props.onDismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

/** The newest three notifications, newest last and closest to the corner. */
export function Toaster() {
  const toasts = getService(Toasts);
  const items = fromRef(toasts.items);
  const visible = createMemo(() => items().slice(-3));
  return (
    <Portal mount={document.body}>
      <section aria-label="Notifications" class="toast-region">
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
          <For each={visible()}>
            {(item) => (
              <ToastCard
                item={item}
                front={items().at(-1) === item}
                onDismiss={() => Effect.runSync(toasts.dismiss(item.id))}
              />
            )}
          </For>
        </ol>
      </section>
    </Portal>
  );
}
