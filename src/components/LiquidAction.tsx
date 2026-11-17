import { clsx } from "clsx";
import type { PropsWithChildren } from "react";
import { LiquidGlass } from "./LiquidGlass";

export function LiquidAction({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <LiquidGlass className={clsx("listing-action", className)} radius={999}>
      {children}
    </LiquidGlass>
  );
}
