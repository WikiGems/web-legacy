import {
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  getBase58Encoder,
  isAddress,
  type Address,
} from "@solana/kit";
import type { Env } from "../env";
import { HttpError } from "../http-error";
import { parseUsdcMinor } from "./amounts";
import { WIKIGEMS_PROGRAM_PROGRAM_ADDRESS } from "./generated";

export function chainNotConfigured() {
  return new HttpError(503, "Chain not configured.", "CHAIN_NOT_CONFIGURED");
}

export function linkedWallet(value: string | null | undefined): Address {
  if (!value || !isAddress(value)) {
    throw new HttpError(409, "Link a Solana wallet first.", "WALLET_REQUIRED");
  }
  return value;
}

export async function loadSigner(secret: string | undefined) {
  try {
    if (!secret) throw chainNotConfigured();
    const keyPair = await createKeyPairFromBytes(
      getBase58Encoder().encode(secret),
    );
    return {
      address: await getAddressFromPublicKey(keyPair.publicKey),
      keyPair,
    };
  } catch {
    throw chainNotConfigured();
  }
}

export type ServerSigner = Awaited<ReturnType<typeof loadSigner>>;

function settingAddress(value: string | undefined): Address {
  if (!value || !isAddress(value)) throw chainNotConfigured();
  return value;
}

function integerSetting(value: string, max: number) {
  if (!/^(0|[1-9][0-9]{0,15})$/.test(value)) throw chainNotConfigured();
  const number = Number(value);
  if (number > max) throw chainNotConfigured();
  return number;
}

export function minimumPrice(env: Env) {
  const value = parseUsdcMinor(env.MIN_PRICE_USDC_MINOR ?? "100000");
  if (value === null) throw chainNotConfigured();
  return value;
}

export function sponsorBalanceFloor(env: Env) {
  const value = parseUsdcMinor(env.SPONSOR_MIN_BALANCE_LAMPORTS ?? "100000000");
  if (value === null) throw chainNotConfigured();
  return value;
}

export async function marketConfig(env: Env) {
  return {
    sponsor: await loadSigner(env.SPONSOR_SECRET_KEY),
    usdcMint: settingAddress(env.USDC_MINT),
    treasury: settingAddress(env.TREASURY_WALLET),
    programAddress: settingAddress(
      env.WIKIGEMS_PROGRAM_ID || WIKIGEMS_PROGRAM_PROGRAM_ADDRESS,
    ),
    feeBps: integerSetting(env.MARKET_FEE_BPS || "250", 10_000),
  };
}

export async function claimConfig(env: Env) {
  const [market, mintAuthority] = await Promise.all([
    marketConfig(env),
    loadSigner(env.MINT_AUTHORITY_SECRET_KEY),
  ]);
  const price = parseUsdcMinor(env.CLAIM_PRICE_USDC_MINOR || "250000");
  const origin = publicOrigin(env);
  if (price === null || !origin) throw chainNotConfigured();
  return {
    ...market,
    mintAuthority,
    freeClaimsDailyBudget: integerSetting(
      env.FREE_CLAIMS_DAILY_BUDGET ?? "50",
      Number.MAX_SAFE_INTEGER,
    ),
    freeClaimsPerUser: integerSetting(
      env.FREE_CLAIMS_PER_USER || "1",
      Number.MAX_SAFE_INTEGER,
    ),
    price,
    origin,
  };
}

export function publicOrigin(env: Env): string | null {
  try {
    const url = new URL(env.PUBLIC_ORIGIN || "");
    if (
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      return url.origin;
  } catch {
    // An unset public origin is allowed outside the claim route.
  }
  return null;
}
