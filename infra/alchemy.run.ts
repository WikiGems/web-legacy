import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Turso from "@alchemy.run/turso";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { readRuntimeConfig, resolveStageConfig } from "./src/stage";
import { wikigemsState } from "./src/state";

/**
 * WikiGems application & cloud infrastructure stack (pure TypeScript + Effect).
 *
 * Manages per-stage:
 * - Turso libSQL database (protected in `prod`, isolated & ephemeral per PR in `pr-*`)
 * - Scoped, expiring Turso database auth token (bound as a Worker secret)
 * - Cloudflare R2 private avatar bucket (protected in `prod`, auto-emptied on PR teardown)
 * - Cloudflare Worker serving `worker/index.ts`, `dist/client` static SPA assets,
 *   maintenance crons (`prod`), secrets, and version metadata for instant rollbacks.
 */
export default Alchemy.Stack(
  "wikigems",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Turso.providers()),
    state: wikigemsState(),
  },
  Effect.gen(function* () {
    const rawStage = yield* Alchemy.Stage;
    const stage = resolveStageConfig(rawStage);
    const config = yield* readRuntimeConfig(stage);

    const tursoGroup = config.tursoManageGroup
      ? yield* Turso.Group("TursoGroup", {
          name: config.tursoGroup,
          location: config.tursoLocation,
          deleteProtection: stage.isProd,
        }).pipe(Alchemy.RemovalPolicy.protect(stage.isProd))
      : Turso.Group.lookup({ name: config.tursoGroup });

    const database = yield* Turso.Database("Database", {
      name: stage.databaseName,
      group: tursoGroup.name,
      deleteProtection: stage.isProd,
    }).pipe(Alchemy.RemovalPolicy.protect(stage.isProd));

    const databaseToken = yield* Turso.DatabaseToken("DatabaseToken", {
      database: database.name,
      authorization: "full-access",
      expiration: stage.tursoTokenExpiration,
    });

    const avatars = yield* Cloudflare.R2.Bucket("Avatars", {
      name: stage.avatarsBucketName,
      publicAccess: false,
      forceDestroy: !stage.isProd,
      lifecycleRules: [
        {
          id: "abort-incomplete-multipart-uploads",
          enabled: true,
          abortMultipartUploadsTransition: {
            condition: { type: "Age", maxAge: 86_400 },
          },
        },
      ],
    }).pipe(Alchemy.RemovalPolicy.protect(stage.isProd));

    const optionalSecrets: Record<string, unknown> = {};
    if (Option.isSome(config.resendApiKey)) {
      optionalSecrets.RESEND_API_KEY = config.resendApiKey.value;
    }
    if (Option.isSome(config.sponsorSecretKey)) {
      optionalSecrets.SPONSOR_SECRET_KEY = config.sponsorSecretKey.value;
    }
    if (Option.isSome(config.mintAuthoritySecretKey)) {
      optionalSecrets.MINT_AUTHORITY_SECRET_KEY =
        config.mintAuthoritySecretKey.value;
    }

    const versionMeta =
      Option.isSome(config.releaseTag) || Option.isSome(config.releaseMessage)
        ? {
            ...(Option.isSome(config.releaseTag)
              ? { tag: config.releaseTag.value }
              : {}),
            ...(Option.isSome(config.releaseMessage)
              ? { message: config.releaseMessage.value }
              : {}),
          }
        : undefined;

    const web = yield* Cloudflare.Worker("Web", {
      name: stage.workerName,
      main: "../worker/index.ts",
      compatibility: {
        date: "2026-10-13",
        flags: ["nodejs_compat"],
      },
      assets: {
        directory: "../dist/client",
        notFoundHandling: "single-page-application",
        runWorkerFirst: ["/api/*", "/g/*"],
      },
      observability: {
        enabled: true,
      },
      crons: [...stage.crons],
      workersDev: stage.workersDev,
      ...(Option.isSome(config.customDomain)
        ? { domain: { name: config.customDomain.value } }
        : {}),
      ...(versionMeta ? { version: versionMeta } : {}),
      env: {
        AVATARS: avatars,
        TURSO_DATABASE_URL: database.url,
        TURSO_AUTH_TOKEN: databaseToken.token,
        BETTER_AUTH_SECRET: config.betterAuthSecret,
        ...optionalSecrets,
        BETTER_AUTH_URL: config.betterAuthUrl,
        PASSKEY_RP_ID: config.passkeyRpId,
        PASSKEY_ORIGIN: config.passkeyOrigin,
        TRUSTED_ORIGINS: config.trustedOrigins,
        SOLANA_RPC_URL: config.solanaRpcUrl,
        SOLANA_CLUSTER: config.solanaCluster,
        WIKIGEMS_PROGRAM_ID: config.wikigemsProgramId,
        USDC_MINT: config.usdcMint,
        TREASURY_WALLET: config.treasuryWallet,
        MARKET_FEE_BPS: config.marketFeeBps,
        CLAIM_PRICE_USDC_MINOR: config.claimPriceUsdcMinor,
        FREE_CLAIMS_PER_USER: config.freeClaimsPerUser,
        PUBLIC_ORIGIN: config.publicOrigin,
        EMAIL_FROM: config.emailFrom,
      },
    });

    return {
      stage: stage.sanitizedStage,
      environment: stage.kind,
      workerName: web.workerName,
      url: web.url,
      versionId: web.versionId,
      avatarsBucket: avatars.bucketName,
      databaseName: database.name,
      databaseUrl: database.url,
    };
  }),
);
