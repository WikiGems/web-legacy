import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import {
  classifyStage,
  readRuntimeConfig,
  resolveStageConfig,
  sanitizeStageName,
} from "../src/stage";

describe("infra stage config", () => {
  it("sanitizes arbitrary branch/stage identifiers into cloud-safe names", () => {
    expect(sanitizeStageName("PR_42/Feature!")).toBe("pr-42-feature");
    expect(sanitizeStageName("  ---prod---  ")).toBe("prod");
    expect(sanitizeStageName("___")).toBe("dev");
  });

  it("classifies prod, preview, and dev stages accurately", () => {
    expect(classifyStage("prod")).toBe("prod");
    expect(classifyStage("production")).toBe("prod");
    expect(classifyStage("pr-128")).toBe("preview");
    expect(classifyStage("preview-main")).toBe("preview");
    expect(classifyStage("live_osbyrne")).toBe("dev");
  });

  it("derives production names with cron enabled and preview URLs disabled", () => {
    const prod = resolveStageConfig("prod");
    expect(prod.isProd).toBe(true);
    expect(prod.isPreview).toBe(false);
    expect(prod.workerName).toBe("wikigems");
    expect(prod.avatarsBucketName).toBe("wikigems-avatars");
    expect(prod.databaseName).toBe("wikigems");
    expect(prod.crons).toEqual(["*/15 * * * *"]);
    expect(prod.workersDev).toEqual({ enabled: true, previewsEnabled: false });
    expect(prod.tursoTokenExpiration).toBe("30d");
  });

  it("derives isolated ephemeral resources for PR previews without crons", () => {
    const pr = resolveStageConfig("pr-42");
    expect(pr.isProd).toBe(false);
    expect(pr.isPreview).toBe(true);
    expect(pr.workerName).toBe("wikigems-pr-42");
    expect(pr.avatarsBucketName).toBe("wikigems-avatars-pr-42");
    expect(pr.databaseName).toBe("wikigems-pr-42");
    expect(pr.crons).toEqual([]);
    expect(pr.workersDev).toEqual({ enabled: true, previewsEnabled: true });
    expect(pr.tursoTokenExpiration).toBe("7d");
  });

  it("keeps physical resource names within the 63-character DNS/R2/Turso limit", () => {
    const longStage = `pr-${"a".repeat(80)}`;
    const config = resolveStageConfig(longStage);
    expect(config.workerName.length).toBeLessThanOrEqual(63);
    expect(config.avatarsBucketName.length).toBeLessThanOrEqual(63);
    expect(config.databaseName.length).toBeLessThanOrEqual(63);
    expect(config.workerName.endsWith("-")).toBe(false);
  });

  it("reads typed Effect Config with Redacted secrets and ignores custom domain on preview", async () => {
    const provider = ConfigProvider.fromUnknown({
      BETTER_AUTH_SECRET: "super-secret-at-least-32-bytes-long",
      RESEND_API_KEY: "re_test_123",
      WIKIGEMS_CUSTOM_DOMAIN: "wikigems.example.com",
      WIKIGEMS_RELEASE_TAG: "v0.2.0",
    });

    const prodConfig = await Effect.runPromise(
      readRuntimeConfig(resolveStageConfig("prod")).pipe(
        Effect.provide(ConfigProvider.layer(provider)),
      ),
    );
    expect(Redacted.value(prodConfig.betterAuthSecret)).toBe(
      "super-secret-at-least-32-bytes-long",
    );
    expect(Option.isSome(prodConfig.resendApiKey)).toBe(true);
    expect(Option.getOrUndefined(prodConfig.customDomain)).toBe(
      "wikigems.example.com",
    );
    expect(Option.getOrUndefined(prodConfig.releaseTag)).toBe("v0.2.0");

    const previewConfig = await Effect.runPromise(
      readRuntimeConfig(resolveStageConfig("pr-7")).pipe(
        Effect.provide(ConfigProvider.layer(provider)),
      ),
    );
    expect(Option.isNone(previewConfig.customDomain)).toBe(true);
  });
});
