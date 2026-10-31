import { parseCookies } from "better-auth/cookies";
import type { WikiGemsAuth } from "./auth";

// Offer all passkeys and register separately from the active user.
// Retain challenge and multi-session cookies to preserve the other accounts.
export async function handleAccountAuth(request: Request, auth: WikiGemsAuth) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/account-auth", "/api/auth");
  if (!(
    (path === "/api/auth/passkey/generate-register-options" &&
      request.method === "GET") ||
    (path === "/api/auth/passkey/verify-registration" &&
      request.method === "POST") ||
    (path === "/api/auth/passkey/generate-authenticate-options" &&
      request.method === "GET") ||
    (path === "/api/auth/passkey/verify-authentication" &&
      request.method === "POST")
  ))
    return new Response(null, { status: 404 });

  const { authCookies } = await auth.$context;
  if (request.method === "GET") {
    const accounts = await auth.api.listDeviceSessions({
      headers: request.headers,
    });
    if (accounts.length >= 5) {
      return Response.json(
        {
          message:
            "Log out of an account before adding another. You can keep five accounts signed in.",
        },
        {
          status: 409,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  }
  const activeCookies = [
    authCookies.sessionToken.name,
    authCookies.sessionData.name,
  ];
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const headers = new Headers(request.headers);
  headers.set(
    "cookie",
    [...cookies]
      .filter(
        ([name]) =>
          !activeCookies.some(
            (active) => name === active || name.startsWith(`${active}.`),
          ),
      )
      .map(([name, value]) => `${name}=${value}`)
      .join("; "),
  );
  url.pathname = path;
  return auth.handler(new Request(url, new Request(request, { headers })));
}
