import { createMemo, Show } from "solid-js";
import { AnimatedCounter } from "./ui/animated-counter";

export function MoneyAmount(props: {
  amount: number;
  currency: "USDC" | "SOL";
  decimals?: number;
  class?: string;
  unitClass?: string;
}) {
  const decimals = () => props.decimals ?? 2;
  const formatted = createMemo(() =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals(),
      maximumFractionDigits: decimals(),
    }).format(props.amount),
  );
  // Round for display before passing to the wheels; payment values stay untouched.
  const rounded = createMemo(() => Number(formatted().replaceAll(",", "")));
  const canAnimate = createMemo(
    () =>
      Number.isFinite(props.amount) &&
      Number.isSafeInteger(Math.round(Math.abs(rounded()) * 10 ** decimals())),
  );
  return (
    <span
      data-slot="money-amount"
      class={[
        "inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums",
        props.class,
      ]}
    >
      <span class="sr-only">
        {formatted()} {props.currency}
      </span>
      <Show
        when={canAnimate()}
        fallback={<span aria-hidden="true">{formatted()}</span>}
      >
        <AnimatedCounter
          aria-hidden
          value={rounded()}
          decimals={decimals()}
          duration={0.4}
        />
      </Show>
      <span aria-hidden="true" class={props.unitClass}>
        {props.currency}
      </span>
    </span>
  );
}
