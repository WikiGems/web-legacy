export interface Env {
  ASSETS: Fetcher;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  PASSKEY_RP_ID?: string;
  PASSKEY_ORIGIN?: string;
  TRUSTED_ORIGINS?: string;
  SOLANA_RPC_URL?: string;
  SOLANA_CLUSTER?: string;
}
