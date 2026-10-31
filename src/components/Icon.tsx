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

// Keep semantic names at call sites; every icon uses the same gem artwork.
export function Icon(props: { name: IconName; size?: number; class?: string }) {
  return (
    <img
      class={props.class ? `wg-icon ${props.class}` : "wg-icon"}
      src="/gem.png"
      width={props.size ?? 18}
      height={props.size ?? 18}
      style={{ "object-fit": "contain", "flex-shrink": 0 }}
      alt=""
      aria-hidden="true"
    />
  );
}
