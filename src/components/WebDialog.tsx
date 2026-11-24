import { onSettled, type ParentProps } from "solid-js";
import { Portal } from "@solidjs/web";

// Open dialogs, topmost last. Everything beneath the top dialog is inert, so
// focus and pointer input cannot reach the page behind it. Toasts live in
// their own portal and stay usable.
const openDialogs: HTMLElement[] = [];
function syncInert() {
  document
    .getElementById("root")
    ?.toggleAttribute("inert", openDialogs.length > 0);
  const top = openDialogs.at(-1);
  for (const dialog of openDialogs)
    dialog.toggleAttribute("inert", dialog !== top);
}

const focusable =
  'a[href], summary, button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog: traps focus, closes on Escape or an outside click, locks
 * page scroll and returns focus to whatever opened it. While `busy`, a pending
 * operation cannot be dismissed.
 */
export function WebDialog(
  props: ParentProps<{
    onClose: () => void;
    labelId: string;
    class?: string;
    busy?: boolean;
    wide?: boolean;
  }>,
) {
  let dialog: HTMLDivElement | undefined;
  let layer: HTMLDivElement | undefined;
  const opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  const requestClose = () => {
    if (!props.busy) props.onClose();
  };

  onSettled(() => {
    if (!layer || !dialog) return;
    const mounted = layer;
    openDialogs.push(mounted);
    syncInert();
    dialog.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== mounted) return;
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openDialogs.indexOf(mounted);
      if (index >= 0) openDialogs.splice(index, 1);
      syncInert();
      if (opener?.isConnected) opener.focus();
    };
  });

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !dialog) return;
    const items = [...dialog.querySelectorAll<HTMLElement>(focusable)].filter(
      (element) => element.getClientRects().length > 0,
    );
    const first = items[0];
    const last = items.at(-1);
    const active = document.activeElement;
    if (!first || !last) {
      event.preventDefault();
    } else if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <Portal mount={document.body}>
      <div
        ref={layer}
        class="modal modal-open modal-bottom sm:modal-middle"
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.labelId}
          tabindex="-1"
          class={[
            "modal-box min-w-0 space-y-6 p-4 outline-none sm:p-8",
            props.wide ? "max-w-3xl" : "max-w-lg",
            props.class,
          ]}
          onKeyDown={trapFocus}
        >
          {props.children}
        </div>
      </div>
    </Portal>
  );
}
