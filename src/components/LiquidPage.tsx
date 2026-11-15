import { clsx } from "clsx";
import { useId, useRef, type ComponentProps } from "react";
import { useListingGlass } from "../lib/liquid-glass";
import { Page } from "./Page";

export function LiquidPage({
  className,
  ...props
}: Omit<ComponentProps<typeof Page>, "id" | "ref">) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useListingGlass(ref);
  return (
    <Page
      {...props}
      id={id}
      ref={ref}
      className={clsx("listing-marketplace", className)}
    />
  );
}
