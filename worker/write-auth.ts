import type { WikiGemsAuth } from "./auth";
import { HttpError } from "./http-error";

export async function authorizeWrite(
  request: Request,
  auth: WikiGemsAuth,
  userId: string,
) {
  const origin = request.headers.get("origin");
  const context = await auth.$context;
  if (
    origin !== new URL(request.url).origin ||
    !context.trustedOrigins.includes(origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "Untrusted request origin.", "UNTRUSTED_ORIGIN");
  if (request.headers.get("x-wikigems-account") !== userId)
    throw new HttpError(
      409,
      "Your active account changed. Reload and try again.",
      "ACTIVE_ACCOUNT_CHANGED",
    );
}
