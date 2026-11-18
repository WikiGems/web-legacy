import {
  type Accessor,
  type ParentProps,
  createEffect,
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
} from "solid-js";
import { useLinkProps, useLocation } from "@tanstack/solid-router";
import { useSession } from "../lib/session";
import { haptic } from "../lib/haptics";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { LiquidGlass } from "./LiquidGlass";

const destinations = [
  { to: "/play", label: "Play", shortLabel: "Play", icon: "search", primary: true },
  {
    to: "/collection",
    label: "My collection",
    shortLabel: "Cards",
    icon: "cards",
    primary: true,
  },
  { to: "/trade", label: "Trade", shortLabel: "Trade", icon: "swap", primary: true },
  { to: "/buy", label: "Buy", shortLabel: "Buy", icon: "coin", primary: false },
  { to: "/sell", label: "Sell", shortLabel: "Sell", icon: "plus", primary: false },
  {
    to: "/action",
    label: "Action",
    shortLabel: "Action",
    icon: "bolt",
    primary: false,
  },
  {
    to: "/wallet",
    label: "Wallet",
    shortLabel: "Wallet",
    icon: "wallet",
    primary: false,
  },
  {
    to: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: "settings",
    primary: false,
  },
] satisfies {
  to:
    | "/play"
    | "/collection"
    | "/trade"
    | "/buy"
    | "/sell"
    | "/action"
    | "/wallet"
    | "/settings";
  label: string;
  shortLabel: string;
  icon: IconName;
  primary: boolean;
}[];

function routeFeedback(to: string) {
  haptic(
    to === "/trade"
      ? "swap"
      : to === "/buy"
        ? "buy"
        : to === "/sell"
          ? "sell"
          : "selection",
  );
}

type SectionPath = (typeof destinations)[number]["to"] | "/account";

/**
 * A navigation link whose current state follows the app's section, so an
 * auction page keeps "Buy" highlighted. The router marks only exact matches,
 * and it always overwrites `aria-current`, hence the explicit override.
 */
function SectionLink(
  props: ParentProps<{
    to: SectionPath;
    section: Accessor<string>;
    class: string;
    label?: string;
    testid?: string;
    onClick: () => void;
  }>,
) {
  const link = useLinkProps({
    to: props.to,
    activeOptions: { exact: true },
    class: props.class,
  });
  return (
    <a
      {...link}
      aria-label={props.label}
      aria-current={props.section() === props.to ? "page" : undefined}
      data-testid={props.testid}
      onClick={(event) => {
        props.onClick();
        const handler = (link as { onClick?: (event: MouseEvent) => void })
          .onClick;
        handler?.(event);
      }}
    >
      {props.children}
    </a>
  );
}

/** Glass layer behind the bar or popup's controls; mobile only. */
function NavigationGlass(props: { radius: number }) {
  return <LiquidGlass class="nav-glass" radius={props.radius} aria-hidden="true" />;
}

export function Nav() {
  const session = useSession();
  const pathname = useLocation({ select: (location) => location.pathname });
  const section = createMemo(() =>
    pathname() === "/auctions/new"
      ? "/sell"
      : pathname().startsWith("/auctions/")
        ? "/buy"
        : pathname(),
  );
  const [moreOpen, setMoreOpen] = createSignal(false);
  const secondary = destinations.filter((destination) => !destination.primary);
  const selectedSecondary = createMemo(() =>
    secondary.find(({ to }) => to === section()),
  );
  let more: HTMLDivElement | undefined;

  // Navigating, resizing, pressing Escape or clicking elsewhere closes the menu.
  createEffect(pathname, () => {
    setMoreOpen(false);
  });
  onSettled(() => {
    const close = () => setMoreOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !more?.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  return (
    <nav aria-label="Primary" class="app-navigation liquid-glass-panel">
      <NavigationGlass radius={999} />
      <div class="nav-pages">
        <For each={destinations}>
          {(destination) => (
            <div
              class={["nav-tip flex", { "nav-secondary": !destination.primary }]}
            >
              <SectionLink
                to={destination.to}
                section={section}
                label={destination.label}
                class="nav-item"
                onClick={() => {
                  routeFeedback(destination.to);
                  setMoreOpen(false);
                }}
              >
                <span class="nav-icon">
                  <Icon name={destination.icon} size={23} />
                </span>
                <span class="nav-label" aria-hidden="true">
                  {destination.shortLabel}
                </span>
              </SectionLink>
              <span role="tooltip" class="nav-tooltip">
                {destination.label}
              </span>
            </div>
          )}
        </For>
        <div class="nav-more" ref={more}>
          <button
            type="button"
            class="nav-item"
            aria-label="More sections"
            aria-haspopup="dialog"
            aria-expanded={moreOpen() ? "true" : "false"}
            data-active={selectedSecondary() ? "true" : "false"}
            aria-current={selectedSecondary() ? "page" : undefined}
            onClick={() => {
              haptic("selection");
              setMoreOpen((open) => !open);
            }}
          >
            <span class="nav-icon">
              <Icon name={selectedSecondary()?.icon ?? "more"} size={23} />
            </span>
            <span class="nav-label" aria-hidden="true">
              {selectedSecondary()?.shortLabel ?? "More"}
            </span>
          </button>
          <Show when={moreOpen()}>
            <div
              role="dialog"
              aria-label="More sections"
              class="nav-overflow-panel liquid-glass-panel w-60 max-w-[calc(100vw-2rem)]"
            >
              <NavigationGlass radius={24} />
              <div class="nav-overflow-content p-2">
                <p class="px-3 pb-2 pt-1 text-xs font-medium text-muted">
                  More sections
                </p>
                <For each={secondary}>
                  {(destination) => (
                    <SectionLink
                      to={destination.to}
                      section={section}
                      class="nav-overflow-link"
                      onClick={() => {
                        routeFeedback(destination.to);
                        setMoreOpen(false);
                      }}
                    >
                      <Icon name={destination.icon} size={20} />
                      {destination.label}
                    </SectionLink>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
        <div class="nav-tip flex">
          <SectionLink
            to="/account"
            section={section}
            label="Account menu"
            class="nav-item nav-account"
            testid="account-menu"
            onClick={() => {
              haptic("selection");
              setMoreOpen(false);
            }}
          >
            <span class="nav-icon">
              <Avatar
                name={session().data?.user.name ?? "Collector"}
                image={session().data?.user.image}
              />
            </span>
            <span class="nav-label" aria-hidden="true">
              Account
            </span>
          </SectionLink>
          <span role="tooltip" class="nav-tooltip">
            Account
          </span>
        </div>
      </div>
    </nav>
  );
}
