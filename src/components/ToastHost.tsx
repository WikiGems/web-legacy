import { Toaster } from "./ui/toast";
import { useEffect } from "react";
import { restoreAuthToast } from "../lib/ui";

export function ToastHost() {
  useEffect(restoreAuthToast, []);
  return (
    <Toaster
      position="bottom-right"
      visibleToasts={3}
      duration={4600}
      offset={{
        bottom:
          "calc(var(--app-bottom-space, 0px) + 1rem + env(safe-area-inset-bottom, 0px))",
        right: 16,
      }}
      mobileOffset={{
        bottom:
          "calc(var(--app-bottom-space, 0px) + 1rem + env(safe-area-inset-bottom, 0px))",
        left: 16,
        right: 16,
      }}
      toastOptions={{ classNames: { toast: "font-sans" } }}
    />
  );
}
