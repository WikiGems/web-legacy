import { useSyncExternalStore } from "react";
import { Alert } from "@heroui/react";
function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  return online ? null : (
    <div
      className="fixed inset-x-4 z-50 mx-auto max-w-lg"
      style={{
        bottom:
          "calc(var(--app-bottom-space, 0px) + 1rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Alert status="warning" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>You’re offline.</Alert.Title>
          <Alert.Description>
            Connect to sign in and sync your cards.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}
