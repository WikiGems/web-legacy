import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../worker/env";
import { makeSignature } from "better-auth/crypto";
import { createAuth } from "../worker/auth";
import { handleAccount } from "../worker/account";
import { handleAccountAuth } from "../worker/account-auth";

export async function accountFixture(baseURL = "http://localhost:5173") {
  const directory = await mkdtemp(join(tmpdir(), "wikigems-account-"));
  const storage = await getPlatformProxy<Pick<Env, "AVATARS">>({
    configPath: "wrangler.jsonc",
    persist: false,
    envFiles: [],
    remoteBindings: false,
  });
  // Bun cannot transfer a workerd ReadableStream through Miniflare's MessagePort.
  // Buffer only that test transport boundary; all storage calls still use R2.
  const bucket = new Proxy(storage.env.AVATARS, {
    get(target, property) {
      if (property === "get")
        return async (key: string) => {
          const object = await target.get(key);
          if (!object) return null;
          const response = new Response(await object.arrayBuffer());
          return new Proxy(object, {
            get(_object, field) {
              const source = field in response ? response : object;
              const value = Reflect.get(source, field);
              return typeof value === "function" ? value.bind(source) : value;
            },
          });
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const env = {
    AVATARS: bucket,
    TURSO_DATABASE_URL: `file:${join(directory, "test.db")}`,
    BETTER_AUTH_SECRET: "account-tests-only-secret-0123456789abcdef",
    BETTER_AUTH_URL: baseURL,
    PASSKEY_RP_ID: "localhost",
    ASSETS: {
      fetch: async () => new Response(null, { status: 404 }),
      connect: (): never => {
        throw new Error("The test asset binding cannot open sockets.");
      },
    },
  };
  const client = createClient({ url: env.TURSO_DATABASE_URL });
  for (const file of (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await client.executeMultiple(await readFile(`migrations/${file}`, "utf8"));
  }
  const auth = createAuth(env);
  const context = await auth.$context;
  async function signedCookie(name: string, token: string) {
    return `${name}=${encodeURIComponent(`${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`)}`;
  }
  async function addUser(name: string) {
    const user = await context.internalAdapter.createUser(
      {
        name,
        email: `${crypto.randomUUID()}@example.com`,
        emailVerified: true,
      },
      { method: "passkey" },
    );
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = await signedCookie(
      context.authCookies.sessionToken.name,
      session.token,
    );
    const multiCookie = await signedCookie(
      `${context.authCookies.sessionToken.name}_multi-${session.token.toLowerCase()}`,
      session.token,
    );
    return { user, session, cookie, multiCookie };
  }
  async function request(path: string, cookie = "", init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    headers.set("origin", baseURL);
    if (!headers.has("x-wikigems-account")) {
      const session = await auth.api.getSession({ headers });
      headers.set("x-wikigems-account", session?.user.id ?? "");
    }
    const req = new Request(`${baseURL}${path}`, { ...init, headers });
    if (path.startsWith("/api/account-auth/"))
      return handleAccountAuth(req, auth);
    if (path.startsWith("/api/auth/")) return auth.handler(req);
    return handleAccount(req, env, auth);
  }
  async function cleanup() {
    await storage.dispose();
    client.close();
    if (
      context.options.database &&
      "db" in context.options.database &&
      context.options.database.db instanceof Object &&
      "destroy" in context.options.database.db &&
      typeof context.options.database.db.destroy === "function"
    ) {
      await context.options.database.db.destroy();
    }
    await rm(directory, { recursive: true, force: true });
  }
  return { env, auth, client, addUser, signedCookie, request, cleanup };
}
