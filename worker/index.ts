import { createAuth } from "./auth";
import { handleApi } from "./api";
import type { Env } from "./env";
import { handleAccount } from "./account";
import { handleAccountAuth } from "./account-auth";
import { cleanupAvatars } from "./avatars";
import { handleGemMetadata } from "./card-metadata";
import { reconcileChain } from "./chain/cron";

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const results = await Promise.allSettled([
      cleanupAvatars(env),
      reconcileChain(env),
    ]);
    if (results[0]?.status === "rejected") throw results[0].reason;
    if (results[1]?.status === "rejected") throw results[1].reason;
  },
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/g/")) {
      return handleGemMetadata(request, url, env);
    }

    if (url.pathname.startsWith("/api/account-auth/")) {
      return handleAccountAuth(request, createAuth(env, request));
    }

    if (
      url.pathname === "/api/profile" ||
      url.pathname.startsWith("/api/profile/")
    ) {
      return handleAccount(request, env, createAuth(env, request));
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const auth = createAuth(env, request);
      return auth.handler(request);
    }

    if (url.pathname.startsWith("/api/")) {
      const auth = createAuth(env, request);
      return handleApi(request, env, auth);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
