import type { ParentProps } from "solid-js";
import { LiquidGlass } from "./LiquidGlass";

export function LiquidAction(props: ParentProps<{ class?: string }>) {
  return (
    <LiquidGlass class={["listing-action", props.class]} radius={999}>
      {props.children}
    </LiquidGlass>
  );
}
