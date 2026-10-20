import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "./Icon";

export function OfflineNotice() {
  const [online, setOnline] = createSignal(navigator.onLine);
  const updateConnection = () => setOnline(navigator.onLine);

  onMount(() => {
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
  });

  onCleanup(() => {
    window.removeEventListener("online", updateConnection);
    window.removeEventListener("offline", updateConnection);
  });

  return (
    <Show when={!online()}>
      <div class="offline-notice" role="status">
        <Icon name="info" size={16} />
        <span>You’re offline. Connect to sign in and sync your cards.</span>
      </div>
    </Show>
  );
}
