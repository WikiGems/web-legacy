import { onSettled } from "solid-js";
import { Toaster } from "./ui/toast";
import { restoreAuthToast } from "../lib/ui";

export function ToastHost() {
  onSettled(restoreAuthToast);
  return <Toaster />;
}
