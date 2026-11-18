import { createSignal, onSettled, Show } from "solid-js";
import { Alert } from "./ui/feedback";

export function OfflineNotice() {
  const [online, setOnline] = createSignal(navigator.onLine);
  onSettled(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  });
  return (
    <Show when={!online()}>
      <div
        class="fixed inset-x-4 z-50 mx-auto max-w-lg"
        style={{
          bottom:
            "calc(var(--app-bottom-space, 0px) + 1rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Alert status="warning" indicator role="status" title="You’re offline.">
          Connect to sign in and sync your cards.
        </Alert>
      </div>
    </Show>
  );
}
