import { createAuthClient } from "better-auth/solid";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient()],
});
