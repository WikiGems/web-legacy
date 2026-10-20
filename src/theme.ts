import * as stylex from "@stylexjs/stylex";
import { colors } from "./theme.stylex";

const DARK = "@media (prefers-color-scheme: dark)";

export const systemTheme = stylex.createTheme(colors, {
  "--bg": { default: "#f4f7f5", [DARK]: "#060807" },
  "--bg-2": { default: "#eaf0ec", [DARK]: "#090d0b" },
  "--panel": { default: "#ffffff", [DARK]: "#0d1210" },
  "--panel-2": { default: "#f7faf8", [DARK]: "#111915" },
  "--panel-3": { default: "#edf3ef", [DARK]: "#151f1a" },
  "--line": {
    default: "rgba(26, 47, 33, 0.1)",
    [DARK]: "rgba(235, 255, 242, 0.09)",
  },
  "--line-2": {
    default: "rgba(26, 47, 33, 0.19)",
    [DARK]: "rgba(235, 255, 242, 0.18)",
  },
  "--text": { default: "#17231b", [DARK]: "#eef6ef" },
  "--muted": { default: "#53645a", [DARK]: "#8a998d" },
  "--dim": { default: "#68776d", [DARK]: "#5b6a5f" },
  "--green": { default: "#117b4e", [DARK]: "#56f2aa" },
  "--green-2": { default: "#0d6841", [DARK]: "#28d68c" },
  "--on-accent": { default: "#ffffff", [DARK]: "#04120b" },
  "--accent-hover": { default: "#0d6841", [DARK]: "#7bf7bf" },
  "--green-deep": { default: "#d6f1e2", [DARK]: "#0f3d28" },
  "--mint": { default: "#1e4d36", [DARK]: "#c4f9da" },
  "--violet": { default: "#704eb3", [DARK]: "#b69bff" },
  "--orange": { default: "#90500f", [DARK]: "#ffb36e" },
  "--blue": { default: "#285b91", [DARK]: "#96cbff" },
  "--red": { default: "#b34c43", [DARK]: "#ff7e74" },
  "--gold": { default: "#795b0b", [DARK]: "#ffd166" },
});
