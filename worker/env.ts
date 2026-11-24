export interface Env {
  ASSETS: Fetcher;
  AVATARS: R2Bucket;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  PASSKEY_RP_ID?: string;
  PASSKEY_ORIGIN?: string;
  TRUSTED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SOLANA_RPC_URL?: string;
  SOLANA_CLUSTER?: string;
  SPONSOR_SECRET_KEY?: string;
  MINT_AUTHORITY_SECRET_KEY?: string;
  WIKIGEMS_PROGRAM_ID?: string;
  USDC_MINT?: string;
  TREASURY_WALLET?: string;
  MARKET_FEE_BPS?: string;
  MIN_PRICE_USDC_MINOR?: string;
  SPONSOR_MIN_BALANCE_LAMPORTS?: string;
  FREE_CLAIMS_DAILY_BUDGET?: string;
  CLAIM_PRICE_USDC_MINOR?: string;
  FREE_CLAIMS_PER_USER?: string;
  PUBLIC_ORIGIN?: string;
}
