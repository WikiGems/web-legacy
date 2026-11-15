import { useLayoutEffect } from "react";
export function SystemTheme() {
  useLayoutEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme = preference.matches
        ? "dark"
        : "light";
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return null;
}
