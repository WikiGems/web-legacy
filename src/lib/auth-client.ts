import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, multiSessionClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient(), multiSessionClient(), emailOTPClient()],
});

export const accountAuthClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/account-auth",
  plugins: [passkeyClient()],
});
