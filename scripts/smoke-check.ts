export {};

/**
 * Post-deploy HTTP smoke test for preview, production, and rollback workflows.
 *
 * Verifies the deployed Worker serves both the SPA shell (`/`) and the
 * Turso-backed market API (`/api/market`) with HTTP 200 and expected shapes.
 */
const targetUrl = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(
  /\/+$/,
  "",
);

if (!targetUrl) {
  console.error("Usage: bun scripts/smoke-check.ts <base-url>");
  process.exit(1);
}

const MAX_ATTEMPTS = 8;
const RETRY_DELAY_MS = 3_000;

const checkOnce = async (base: string): Promise<void> => {
  const homeRes = await fetch(`${base}/`, { redirect: "follow" });
  if (!homeRes.ok) {
    throw new Error(`GET / returned HTTP ${homeRes.status}`);
  }
  const html = await homeRes.text();
  if (!html.includes("<html") && !html.includes("<!doctype html")) {
    throw new Error("GET / did not return an HTML document.");
  }

  const marketRes = await fetch(`${base}/api/market`, {
    headers: { Accept: "application/json" },
  });
  if (!marketRes.ok) {
    const body = await marketRes.text();
    throw new Error(
      `GET /api/market returned HTTP ${marketRes.status}: ${body.slice(0, 200)}`,
    );
  }
  const payload = (await marketRes.json()) as {
    cards?: unknown;
    listings?: unknown;
  };
  if (!Array.isArray(payload.cards) || !Array.isArray(payload.listings)) {
    throw new Error(
      "GET /api/market JSON did not include expected `cards` and `listings` arrays.",
    );
  }
};

let lastError: unknown;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    await checkOnce(targetUrl);
    console.log(
      `Smoke check passed on ${targetUrl} (attempt ${attempt}/${MAX_ATTEMPTS}).`,
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Smoke attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`);
    if (attempt < MAX_ATTEMPTS) {
      await Bun.sleep(RETRY_DELAY_MS);
    }
  }
}

throw lastError instanceof Error ? lastError : new Error(String(lastError));
