import { describe, expect, test } from "vitest";
import {
  formatAuctionAmount,
  parseAuctionAmount,
} from "../src/lib/auction-preview";

describe("auction preview amounts", () => {
  test("keeps six-decimal amounts and bid increments exact", () => {
    expect(parseAuctionAmount("0.000001")).toBe(1);
    expect(parseAuctionAmount(".5")).toBe(500_000);
    expect(parseAuctionAmount(" 1. ")).toBe(1_000_000);
    expect(parseAuctionAmount("123.456789")).toBe(123_456_789);
    expect(parseAuctionAmount("999999999.999999")).toBe(999_999_999_999_999);
    expect(formatAuctionAmount(300_000 + 50_000)).toBe("0.35");
    expect(formatAuctionAmount(1)).toBe("0.000001");
    expect(formatAuctionAmount(123_456_789)).toBe("123.456789");
  });

  test("rejects empty, non-positive, excess precision and non-decimal inputs", () => {
    for (const value of [
      "",
      " ",
      ".",
      "0",
      "0.000000",
      "-1",
      "1e3",
      "NaN",
      "Infinity",
      "1,000",
      "1.2345678",
      "1000000000",
      "0x10",
    ]) {
      expect(parseAuctionAmount(value)).toBeNull();
    }
  });
});
