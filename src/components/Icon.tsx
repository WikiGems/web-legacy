import type { JSX } from "solid-js";

export type IconName =
  | "arrow-right"
  | "arrow-up-right"
  | "bolt"
  | "cards"
  | "check"
  | "chevron-down"
  | "close"
  | "coin"
  | "copy"
  | "duel"
  | "external"
  | "filter"
  | "flame"
  | "gift"
  | "globe"
  | "info"
  | "lock"
  | "logout"
  | "menu"
  | "pack"
  | "plus"
  | "refresh"
  | "search"
  | "shield"
  | "spark"
  | "swap"
  | "sword"
  | "trash"
  | "trophy"
  | "user"
  | "wallet";

const paths: Record<IconName, () => JSX.Element> = {
  "arrow-right": () => <path d="M4 12h15m0 0-6-6m6 6-6 6" />,
  "arrow-up-right": () => <path d="M7 17 17 7M8 7h9v9" />,
  bolt: () => <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />,
  cards: () => (
    <>
      <rect x="4" y="6" width="11" height="15" rx="2" />
      <path d="M8 3h9a2 2 0 0 1 2 2v12" />
    </>
  ),
  check: () => <path d="m5 12.5 4.2 4.2L19 7" />,
  "chevron-down": () => <path d="m6 9 6 6 6-6" />,
  close: () => <path d="m6 6 12 12M18 6 6 18" />,
  coin: () => (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9h6M9 15h6M12 7v10" />
    </>
  ),
  copy: () => (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  duel: () => (
    <>
      <path d="m4 20 6-6m10-10-6 6M14 4l6 6M4 14l6 6" />
      <path d="m3 17 4 4m14-4-4 4M3 7l4-4m14 4-4-4" />
    </>
  ),
  external: () => (
    <path d="M14 4h6v6m0-6-9 9M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
  ),
  filter: () => <path d="M4 6h16M7 12h10M10 18h4" />,
  flame: () => <path d="M12 3c4 4 6 7 6 10a6 6 0 1 1-12 0c0-2 1-4 3-6 0 3 1 4 2 4 2 0 2-3 1-8Z" />,
  gift: () => (
    <>
      <path d="M4 10h16v11H4zM2 7h20v3H2zM12 7v14" />
      <path d="M12 7C9 7 7 5.8 7 4a2 2 0 0 1 4 0c0 1.4 1 3 1 3Zm0 0c3 0 5-1.2 5-3a2 2 0 0 0-4 0c0 1.4-1 3-1 3Z" />
    </>
  ),
  globe: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z" />
    </>
  ),
  info: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  lock: () => (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: () => <path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9" />,
  menu: () => <path d="M4 7h16M4 12h16M4 17h16" />,
  pack: () => (
    <>
      <path d="M6 4h12l2 4v13H4V8l2-4Z" />
      <path d="M4 8h16M9 4v4m6-4v4" />
    </>
  ),
  plus: () => <path d="M12 5v14M5 12h14" />,
  refresh: () => (
    <path d="M20 7v5h-5M4 17v-5h5m10.5 0A8 8 0 0 0 6 6.5L4 9m16 6-2 2.5A8 8 0 0 1 4.5 12" />
  ),
  search: () => (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  shield: () => <path d="M12 3 5 6v5.5c0 4.4 2.9 7.7 7 9.5 4.1-1.8 7-5.1 7-9.5V6l-7-3Z" />,
  spark: () => <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  swap: () => <path d="M4 8h13l-3-3m3 3-3 3M20 16H7l3 3m-3-3 3-3" />,
  sword: () => (
    <>
      <path d="m5 19 4-4m10-10-4 4M14 4l6 6M4 14l6 6" />
      <path d="m3 17 4 4m10-14 4 4" />
    </>
  ),
  trash: () => <path d="M4 7h16m-10 4v5m4-5v5M7 7l1 13h8l1-13M9 7V4h6v3" />,
  trophy: () => (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 2h8" />
    </>
  ),
  user: () => (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  wallet: () => (
    <>
      <path d="M4 7a3 3 0 0 1 3-3h11v16H7a3 3 0 0 1-3-3V7Z" />
      <path d="M4 8h16M15 13h2" />
    </>
  ),
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
