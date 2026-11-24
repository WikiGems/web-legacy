const U64_MAX = (1n << 64n) - 1n;

export function parseUsdcMinor(value: string): bigint | null {
  if (!/^[1-9][0-9]{0,19}$/.test(value)) return null;
  const amount = BigInt(value);
  return amount <= U64_MAX ? amount : null;
}

export function splitPrice(price: bigint, feeBps: number) {
  const fee = (price * BigInt(feeBps)) / 10_000n;
  return { fee, seller: price - fee };
}

const perDollar = 1_000_000n;

export function parseDollars(input: string): string | null {
  const value = input.trim();
  if (!/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const dollars = whole.replace(/^0+/, "");
  if (dollars.length > 14) return null;
  const amount = BigInt(dollars) * perDollar + BigInt(fraction.padEnd(6, "0"));
  return amount > 0n && amount <= U64_MAX ? amount.toString() : null;
}

export function dollarDecimal(amount: string | bigint, group = false): string {
  const units = BigInt(amount);
  const whole = units / perDollar;
  const fraction = (units % perDollar)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${group ? whole.toLocaleString("en-US") : whole}.${fraction}`;
}

export function formatDollars(amount: string | bigint): string {
  return `$${dollarDecimal(amount, true)}`;
}
