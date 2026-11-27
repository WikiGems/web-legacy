import { resolveStageConfig } from "../src/stage";

/**
 * Resolves the live HTTPS URL for a deployed WikiGems Alchemy stage.
 * Uses `WIKIGEMS_CUSTOM_DOMAIN` in prod when configured, otherwise queries
 * the Cloudflare Workers subdomain for the account.
 */
const stageArg =
  process.argv
    .find((arg) => arg.startsWith("--stage="))
    ?.slice("--stage=".length) ?? process.env.ALCHEMY_STAGE;

if (!stageArg) {
  console.error("Usage: bun infra/scripts/worker-url.ts --stage=<stage>");
  process.exit(1);
}

const stage = resolveStageConfig(stageArg);
const customDomain = process.env.WIKIGEMS_CUSTOM_DOMAIN?.trim();
if (stage.isProd && customDomain) {
  console.log(`https://${customDomain}`);
  process.exit(0);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!accountId || !apiToken) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to resolve the workers.dev URL.",
  );
  process.exit(1);
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/subdomain`,
  { headers: { Authorization: `Bearer ${apiToken}` } },
);
if (!res.ok) {
  throw new Error(
    `Cloudflare subdomain lookup failed (${res.status}): ${await res.text()}`,
  );
}

const body = (await res.json()) as {
  success?: boolean;
  result?: { subdomain?: string };
};
const subdomain = body.result?.subdomain;
if (!body.success || !subdomain) {
  throw new Error(
    "Could not determine Cloudflare workers.dev subdomain for account.",
  );
}

console.log(`https://${stage.workerName}.${subdomain}.workers.dev`);
