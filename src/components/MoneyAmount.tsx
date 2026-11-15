import { clsx } from "clsx";
import { AnimatedCounter } from "./ui/animated-counter";

export function MoneyAmount({
  amount,
  currency,
  decimals = 2,
  className,
  unitClassName,
}: {
  amount: number;
  currency: "USDC" | "SOL";
  decimals?: number;
  className?: string;
  unitClassName?: string;
}) {
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const formatted = formatter.format(amount);
  // Round for display before passing to the wheels; payment values stay untouched.
  const rounded = Number(formatted.replaceAll(",", ""));
  const canAnimate =
    Number.isFinite(amount) &&
    Number.isSafeInteger(Math.round(Math.abs(rounded) * 10 ** decimals));

  return (
    <span
      data-slot="money-amount"
      className={clsx(
        "inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums",
        className,
      )}
    >
      <span className="sr-only">
        {formatted} {currency}
      </span>
      {canAnimate ? (
        <AnimatedCounter
          aria-hidden
          value={rounded}
          decimals={decimals}
          duration={0.4}
        />
      ) : (
        <span aria-hidden>{formatted}</span>
      )}
      <span aria-hidden className={unitClassName}>
        {currency}
      </span>
    </span>
  );
}
