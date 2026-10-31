import { createAuthClient } from "better-auth/solid";
import { passkeyClient } from "@better-auth/passkey/client";
import { multiSessionClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient(), multiSessionClient()],
});

export const accountAuthClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/account-auth",
  plugins: [passkeyClient()],
});
