import { createAuth } from "./auth";
import { handleApi } from "./api";
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
