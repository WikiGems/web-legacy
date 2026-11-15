import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

export function LiquidAction({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={clsx("listing-action", className)} data-liquid-ignore>
      <div className="listing-glass" aria-hidden="true" />
      {children}
    </div>
  );
}
