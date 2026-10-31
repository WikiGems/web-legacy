import { Schema } from "effect";

// Decimal strings preserve u64 precision across JSON. USDC uses six decimals.
export const UsdcAmountSchema = Schema.Struct({
  currency: Schema.Literal("USDC"),
  minorUnits: Schema.String.check(Schema.makeFilter<string>((value) =>
    /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n,
  )),
});
export type UsdcAmount = typeof UsdcAmountSchema.Type;

export const ListingSchema = Schema.Struct({
  id: Schema.String,
  cardId: Schema.String,
  sellerId: Schema.String,
  price: UsdcAmountSchema,
  status: Schema.Literals(["active", "cancelled", "settled"]),
});
export type Listing = typeof ListingSchema.Type;

export const SocialAccountSchema = Schema.Struct({
  userId: Schema.String,
  provider: Schema.Literals(["google", "apple"]),
  providerAccountId: Schema.String,
});
export type SocialAccount = typeof SocialAccountSchema.Type;

export const MintRequestSchema = Schema.Struct({
  cardId: Schema.String,
  walletAddress: Schema.String,
  idempotencyKey: Schema.String,
});
export type MintRequest = typeof MintRequestSchema.Type;
