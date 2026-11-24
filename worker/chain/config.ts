import {
  address,
  createKeyPairFromBytes,
  getAddressFromPublicKey,
  getBase58Encoder,
  isAddress,
  type Address,
} from "@solana/kit";
import type { Env } from "../env";
import { HttpError } from "../http-error";
import { parseUsdcMinor } from "../../shared/amounts";
import { WIKIGEMS_PROGRAM_PROGRAM_ADDRESS } from "./generated";

const DEVNET_USDC = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

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

export const usdcMintAddress = (env: Env) =>
  settingAddress(env.USDC_MINT || DEVNET_USDC);

export const marketFeeBps = (env: Env) =>
  integerSetting(env.MARKET_FEE_BPS || "250", 10_000);

export function claimTerms(env: Env) {
  const price = parseUsdcMinor(env.CLAIM_PRICE_USDC_MINOR || "250000");
  if (price === null) throw chainNotConfigured();
  return {
    price,
    freeClaimsPerUser: integerSetting(
      env.FREE_CLAIMS_PER_USER || "1",
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

export async function marketConfig(env: Env) {
  return {
    sponsor: await loadSigner(env.SPONSOR_SECRET_KEY),
    usdcMint: usdcMintAddress(env),
    treasury: settingAddress(env.TREASURY_WALLET),
    feeBps: marketFeeBps(env),
  };
}

export async function claimConfig(env: Env) {
  const [market, mintAuthority] = await Promise.all([
    marketConfig(env),
    loadSigner(env.MINT_AUTHORITY_SECRET_KEY),
  ]);
  const origin = publicOrigin(env);
  if (!origin) throw chainNotConfigured();
  return {
    ...market,
    ...claimTerms(env),
    mintAuthority,
    programAddress: settingAddress(
      env.WIKIGEMS_PROGRAM_ID || WIKIGEMS_PROGRAM_PROGRAM_ADDRESS,
    ),
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
