import { expect, test } from "bun:test";
import { Schema } from "effect";
import { UsdcAmountSchema } from "../src";

const decode = Schema.decodeUnknownSync(UsdcAmountSchema);
test("USDC minor units preserve the entire Solana u64 range", () => {
  for (const minorUnits of ["0", "1000000", "18446744073709551615"]) {
    expect(decode({ currency: "USDC", minorUnits }).minorUnits).toBe(minorUnits);
  }
});
test("rejects other currencies, floats, negative amounts and u64 overflow", () => {
  for (const minorUnits of ["-1", "1.5", "01", "1e6", "18446744073709551616", "", 1000000]) {
    expect(() => decode({ currency: "USDC", minorUnits })).toThrow();
  }
  expect(() => decode({ currency: "SOL", minorUnits: "1" })).toThrow();
});
