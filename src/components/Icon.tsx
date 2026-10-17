import type { JSX } from "solid-js";

export type IconName =
  | "arrow-right"
  | "arrow-up-right"
  | "bookmark"
  | "check"
  | "chevron-down"
  | "close"
  | "fingerprint"
  | "key"
  | "logout"
  | "menu"
  | "plus"
  | "search"
  | "shield"
  | "spark"
  | "trash"
  | "trend";

const paths: Record<IconName, () => JSX.Element> = {
  "arrow-right": () => <path d="M4 12h15m0 0-6-6m6 6-6 6" />,
  "arrow-up-right": () => <path d="M7 17 17 7M8 7h9v9" />,
  bookmark: () => <path d="M6.5 4.5h11v15L12 15.6l-5.5 3.9v-15Z" />,
  check: () => <path d="m5 12.5 4.2 4.2L19 7" />,
  "chevron-down": () => <path d="m6 9 6 6 6-6" />,
  close: () => <path d="m6 6 12 12M18 6 6 18" />,
  fingerprint: () => (
    <>
      <path d="M12 3a8.5 8.5 0 0 0-8.2 6.2" />
      <path d="M20.2 9.2A8.5 8.5 0 0 1 19 18" />
      <path d="M4.1 14.3a8.5 8.5 0 0 0 2.2 4" />
      <path d="M8 7.4a5.8 5.8 0 0 1 8.3 4.8c.1 2.5-.5 5-1.8 7" />
      <path d="M8.1 12.3a4 4 0 0 1 7.9.5c0 2.4-.4 4.7-1.2 6.6" />
      <path d="M11.8 12.6c.1 2.2-.3 4.3-1.2 6.1" />
    </>
  ),
  key: () => (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9m-3 0v3m-3-3v2" />
    </>
  ),
  logout: () => <path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9" />,
  menu: () => <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: () => <path d="M12 5v14M5 12h14" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  shield: () => <path d="M12 3 5 6v5.5c0 4.4 2.9 7.7 7 9.5 4.1-1.8 7-5.1 7-9.5V6l-7-3Z" />,
  spark: () => <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  trash: () => <path d="M4 7h16m-10 4v5m4-5v5M7 7l1 13h8l1-13M9 7V4h6v3" />,
  trend: () => <path d="m4 16 5-5 4 4 7-8m0 0h-5m5 0v5" />,
};

export function Icon(props: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={props.class}
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths[props.name]()}
    </svg>
  );
}
