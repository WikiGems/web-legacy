import { Popover, Tooltip } from "@heroui/react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Link, useLocation } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { haptic } from "../lib/haptics";
import { HapticButton as Button } from "./HapticButton";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { LiquidGlass } from "./LiquidGlass";

const destinations = [
  {
    to: "/play",
    label: "Play",
    shortLabel: "Play",
    icon: "search",
    primary: true,
  },
  {
    to: "/collection",
    label: "My collection",
    shortLabel: "Cards",
    icon: "cards",
    primary: true,
  },
  {
    to: "/trade",
    label: "Trade",
    shortLabel: "Trade",
    icon: "swap",
    primary: true,
  },
  { to: "/buy", label: "Buy", shortLabel: "Buy", icon: "coin", primary: false },
  {
    to: "/sell",
    label: "Sell",
    shortLabel: "Sell",
    icon: "plus",
    primary: false,
  },
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

/** Glass layer behind the bar or popup's controls; mobile only. */
function NavigationGlass({ radius }: { radius: number }) {
  return <LiquidGlass className="nav-glass" radius={radius} aria-hidden />;
}

export function Nav() {
  const { data } = authClient.useSession();
  const pathname = useLocation({ select: (location) => location.pathname });
  const section =
    pathname === "/auctions/new"
      ? "/sell"
      : pathname.startsWith("/auctions/")
        ? "/buy"
        : pathname;
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    const close = () => setMoreOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);
  const secondary = destinations.filter((destination) => !destination.primary);
  const selectedSecondary = secondary.find(({ to }) => to === section);

  return (
    <nav aria-label="Primary" className="app-navigation liquid-glass-panel">
      <NavigationGlass radius={999} />
      <div className="nav-pages">
        {destinations.map(({ to, label, shortLabel, icon, primary }) => (
          <Tooltip key={to} delay={200}>
            <Tooltip.Trigger<"a">
              role="link"
              render={(props) => (
                <Link
                  {...props}
                  to={to}
                  aria-label={label}
                  aria-current={section === to ? "page" : undefined}
                  activeOptions={{ exact: true }}
                  className={clsx("nav-item", !primary && "nav-secondary")}
                  onClick={() => {
                    routeFeedback(to);
                    setMoreOpen(false);
                  }}
                >
                  <span className="nav-icon">
                    <Icon name={icon} size={23} />
                  </span>
                  <span className="nav-label" aria-hidden="true">
                    {shortLabel}
                  </span>
                </Link>
              )}
            />
            <Tooltip.Content placement="right" className="nav-tooltip">
              {label}
            </Tooltip.Content>
          </Tooltip>
        ))}
        <div className="nav-more">
          <Popover key={pathname} isOpen={moreOpen} onOpenChange={setMoreOpen}>
            <Button
              variant="ghost"
              className="nav-item"
              aria-label="More sections"
              data-active={Boolean(selectedSecondary)}
              aria-current={selectedSecondary ? "page" : undefined}
            >
              <span className="nav-icon">
                <Icon name={selectedSecondary?.icon ?? "more"} size={23} />
              </span>
              <span className="nav-label" aria-hidden="true">
                {selectedSecondary?.shortLabel ?? "More"}
              </span>
            </Button>
            <Popover.Content
              placement="top"
              offset={12}
              className="nav-overflow-panel liquid-glass-panel w-60 max-w-[calc(100vw-2rem)]"
            >
              <NavigationGlass radius={24} />
              <Popover.Dialog
                aria-label="More sections"
                className="nav-overflow-content p-2"
              >
                <p className="px-3 pb-2 pt-1 text-xs font-medium text-muted">
                  More sections
                </p>
                {secondary.map(({ to, label, icon }) => (
                  <Link
                    key={to}
                    to={to}
                    activeOptions={{ exact: true }}
                    aria-current={section === to ? "page" : undefined}
                    className="nav-overflow-link"
                    onClick={() => {
                      routeFeedback(to);
                      setMoreOpen(false);
                    }}
                  >
                    <Icon name={icon} size={20} />
                    {label}
                  </Link>
                ))}
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        </div>
        <Tooltip delay={200}>
          <Tooltip.Trigger<"a">
            role="link"
            render={(props) => (
              <Link
                {...props}
                to="/account"
                aria-label="Account menu"
                className="nav-item nav-account"
                data-testid="account-menu"
                onClick={() => {
                  haptic("selection");
                  setMoreOpen(false);
                }}
              >
                <span className="nav-icon">
                  <Avatar
                    name={data?.user.name ?? "Collector"}
                    image={data?.user.image}
                  />
                </span>
                <span className="nav-label" aria-hidden="true">
                  Account
                </span>
              </Link>
            )}
          />
          <Tooltip.Content placement="right" className="nav-tooltip">
            Account
          </Tooltip.Content>
        </Tooltip>
      </div>
    </nav>
  );
}
