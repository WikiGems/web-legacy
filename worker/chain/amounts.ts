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
