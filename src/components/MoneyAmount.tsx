import { createMemo, Show } from "solid-js";
import { dollarDecimal } from "../../shared/amounts";
import { AnimatedCounter } from "./ui/animated-counter";

export function MoneyAmount(props: { minorUnits: string }) {
  const exact = createMemo(() => dollarDecimal(props.minorUnits, true));
  const amount = createMemo(() => Number(exact().replaceAll(",", "")));
  const decimals = () => exact().split(".")[1]?.length ?? 2;
  const canAnimate = () =>
    BigInt(props.minorUnits) <= BigInt(Number.MAX_SAFE_INTEGER) &&
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals(),
      maximumFractionDigits: decimals(),
    }).format(amount()) === exact();

  return (
    <span
      data-slot="money-amount"
      class="inline-flex items-baseline whitespace-nowrap tabular-nums"
    >
      <Show when={canAnimate()} fallback={<span>${exact()}</span>}>
        <span class="sr-only">${exact()}</span>
        <span aria-hidden="true">$</span>
        <AnimatedCounter aria-hidden value={amount()} decimals={decimals()} />
      </Show>
    </span>
  );
}
