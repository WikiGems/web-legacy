import { onSettled } from "solid-js";

/** Mirrors the device's light/dark preference onto the document. */
export function SystemTheme() {
  onSettled(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme = preference.matches
        ? "dark"
        : "light";
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  });
  return null;
}
