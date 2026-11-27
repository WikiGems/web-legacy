import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

export type StageKind = "prod" | "preview" | "dev";

export interface StageConfig {
  readonly rawStage: string;
  readonly sanitizedStage: string;
  readonly kind: StageKind;
  readonly isProd: boolean;
  readonly isPreview: boolean;
  readonly workerName: string;
  readonly avatarsBucketName: string;
  readonly databaseName: string;
  readonly tursoTokenExpiration: string;
  readonly crons: readonly string[];
  readonly workersDev: {
    readonly enabled: boolean;
    readonly previewsEnabled: boolean;
  };
}

export interface RuntimeConfig {
  readonly tursoGroup: string;
  readonly tursoLocation: string;
  readonly tursoManageGroup: boolean;
  readonly betterAuthSecret: Redacted.Redacted<string>;
  readonly resendApiKey: Option.Option<Redacted.Redacted<string>>;
  readonly sponsorSecretKey: Option.Option<Redacted.Redacted<string>>;
  readonly mintAuthoritySecretKey: Option.Option<Redacted.Redacted<string>>;
  readonly betterAuthUrl: string;
  readonly passkeyRpId: string;
  readonly passkeyOrigin: string;
  readonly trustedOrigins: string;
  readonly solanaRpcUrl: string;
  readonly solanaCluster: string;
  readonly wikigemsProgramId: string;
  readonly usdcMint: string;
  readonly treasuryWallet: string;
  readonly marketFeeBps: string;
  readonly claimPriceUsdcMinor: string;
  readonly freeClaimsPerUser: string;
  readonly publicOrigin: string;
  readonly emailFrom: string;
  readonly customDomain: Option.Option<string>;
  readonly releaseTag: Option.Option<string>;
  readonly releaseMessage: Option.Option<string>;
}

const MAX_CLOUD_NAME_LENGTH = 63;

/**
 * Normalize an Alchemy stage name into a DNS / R2 / Turso safe identifier:
 * lowercase alphanumeric and dashes, trimmed of leading/trailing dashes.
 */
export const sanitizeStageName = (raw: string): string => {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "dev";
};

export const classifyStage = (rawStage: string): StageKind => {
  const normalized = sanitizeStageName(rawStage);
  if (normalized === "prod" || normalized === "production") {
    return "prod";
  }
  if (normalized.startsWith("pr-") || normalized.startsWith("preview")) {
    return "preview";
  }
  return "dev";
};

const boundedName = (prefix: string, suffix: string): string => {
  const full = `${prefix}-${suffix}`;
  if (full.length <= MAX_CLOUD_NAME_LENGTH) {
    return full;
  }
  return full.slice(0, MAX_CLOUD_NAME_LENGTH).replace(/-+$/g, "");
};

/**
 * Derive deterministic, environment-isolated physical resource names and
 * safety policies for a given Alchemy stage.
 *
 * - `prod` / `production`: stable production names, deletion protection on,
 *   15-minute maintenance cron active, 30-day rotating DB tokens.
 * - `pr-*` / `preview*`: isolated ephemeral worker, R2 bucket, and Turso DB
 *   per pull request so migrations and test data never collide; cron disabled;
 *   destroyed automatically when the PR closes.
 * - everything else (`dev`, `live_<user>`): personal developer sandbox.
 */
export const resolveStageConfig = (rawStage: string): StageConfig => {
  const sanitizedStage = sanitizeStageName(rawStage);
  const kind = classifyStage(sanitizedStage);
  const isProd = kind === "prod";
  const isPreview = kind === "preview";

  return {
    rawStage,
    sanitizedStage,
    kind,
    isProd,
    isPreview,
    workerName: isProd ? "wikigems" : boundedName("wikigems", sanitizedStage),
    avatarsBucketName: isProd
      ? "wikigems-avatars"
      : boundedName("wikigems-avatars", sanitizedStage),
    databaseName: isProd ? "wikigems" : boundedName("wikigems", sanitizedStage),
    tursoTokenExpiration: isProd ? "30d" : "7d",
    crons: isProd ? ["*/15 * * * *"] : [],
    workersDev: {
      enabled: true,
      previewsEnabled: !isProd,
    },
  };
};

const optionalString = (name: string) =>
  Config.option(Config.String(name)).pipe(
    Config.map((opt) => Option.filter(opt, (value) => value.trim().length > 0)),
  );

const optionalRedacted = (name: string) =>
  Config.option(Config.Redacted(name)).pipe(
    Config.map((opt) =>
      Option.filter(opt, (value) => Redacted.value(value).trim().length > 0),
    ),
  );

const stringWithDefault = (name: string, fallback: string) =>
  Config.String(name).pipe(Config.withDefault(fallback));

/**
 * Typed Effect Config reader for WikiGems deployment settings.
 * Secrets are read as `Redacted<string>` so they bind as Cloudflare
 * `secret_text` and never leak into logs or plaintext state.
 */
export const readRuntimeConfig = (
  stage: StageConfig,
): Effect.Effect<RuntimeConfig, Config.ConfigError> =>
  Effect.gen(function* () {
    const tursoGroup = yield* stringWithDefault("TURSO_GROUP", "default");
    const tursoLocation = yield* stringWithDefault(
      "TURSO_LOCATION",
      "aws-eu-west-1",
    );
    const tursoManageGroup = yield* Config.Boolean("TURSO_MANAGE_GROUP").pipe(
      Config.withDefault(false),
    );
    const betterAuthSecret = yield* Config.Redacted("BETTER_AUTH_SECRET");
    const resendApiKey = yield* optionalRedacted("RESEND_API_KEY");
    const sponsorSecretKey = yield* optionalRedacted("SPONSOR_SECRET_KEY");
    const mintAuthoritySecretKey = yield* optionalRedacted(
      "MINT_AUTHORITY_SECRET_KEY",
    );

    const betterAuthUrl = yield* stringWithDefault("BETTER_AUTH_URL", "");
    const passkeyRpId = yield* stringWithDefault("PASSKEY_RP_ID", "");
    const passkeyOrigin = yield* stringWithDefault("PASSKEY_ORIGIN", "");
    const trustedOrigins = yield* stringWithDefault("TRUSTED_ORIGINS", "");
    const solanaRpcUrl = yield* stringWithDefault(
      "SOLANA_RPC_URL",
      "https://api.devnet.solana.com",
    );
    const solanaCluster = yield* stringWithDefault("SOLANA_CLUSTER", "devnet");
    const wikigemsProgramId = yield* stringWithDefault(
      "WIKIGEMS_PROGRAM_ID",
      "3KBQ1Y9YZbKmYKhnXM1u8fcEBHEtizgW3hcBZSYnuUjL",
    );
    const usdcMint = yield* stringWithDefault(
      "USDC_MINT",
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    );
    const treasuryWallet = yield* stringWithDefault("TREASURY_WALLET", "");
    const marketFeeBps = yield* stringWithDefault("MARKET_FEE_BPS", "250");
    const claimPriceUsdcMinor = yield* stringWithDefault(
      "CLAIM_PRICE_USDC_MINOR",
      "250000",
    );
    const freeClaimsPerUser = yield* stringWithDefault(
      "FREE_CLAIMS_PER_USER",
      "1",
    );
    const publicOrigin = yield* stringWithDefault("PUBLIC_ORIGIN", "");
    const emailFrom = yield* stringWithDefault("EMAIL_FROM", "");
    const customDomain = stage.isProd
      ? yield* optionalString("WIKIGEMS_CUSTOM_DOMAIN")
      : Option.none<string>();
    const releaseTag = yield* optionalString("WIKIGEMS_RELEASE_TAG");
    const releaseMessage = yield* optionalString("WIKIGEMS_RELEASE_MESSAGE");

    return {
      tursoGroup,
      tursoLocation,
      tursoManageGroup,
      betterAuthSecret,
      resendApiKey,
      sponsorSecretKey,
      mintAuthoritySecretKey,
      betterAuthUrl,
      passkeyRpId,
      passkeyOrigin,
      trustedOrigins,
      solanaRpcUrl,
      solanaCluster,
      wikigemsProgramId,
      usdcMint,
      treasuryWallet,
      marketFeeBps,
      claimPriceUsdcMinor,
      freeClaimsPerUser,
      publicOrigin,
      emailFrom,
      customDomain,
      releaseTag,
      releaseMessage,
    };
  });
