import { Schema } from "effect";
import {
  MAX_AVATAR_BYTES,
  ReserveUsernameSchema,
  UpdateSocialSchema,
  avatarMime,
  normalizeUsername,
  normalizeXHandle,
} from "../shared/account";
import type { WikiGemsAuth } from "./auth";
import { avatarUrl, changeAvatar, type AvatarEnv } from "./avatars";
import { createDb } from "./db";

class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError(400, "The request body is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AccountError(413, "The upload is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function decodeJson<A>(
  request: Request,
  parse: (value: unknown) => A,
): Promise<A> {
  try {
    const bytes = await readBody(request, 4096);
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parse(value);
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError(400, "The request body is not valid.");
  }
}

function validated<A>(parse: () => A): A {
  try {
    return parse();
  } catch (error) {
    throw new AccountError(
      400,
      error instanceof Error ? error.message : "Invalid profile.",
    );
  }
}

export async function handleAccount(
  request: Request,
  env: AvatarEnv,
  auth: WikiGemsAuth,
): Promise<Response> {
  const db = createDb(env);
  const url = new URL(request.url);
  try {
    // These routes use cookie authentication, so every mutation requires a trusted origin.
    if (!["GET", "HEAD"].includes(request.method)) {
      const { trustedOrigins } = await auth.$context;
      const origin = request.headers.get("origin");
      if (!origin || !trustedOrigins.includes(origin))
        throw new AccountError(403, "Untrusted request origin.");
    }
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      throw new AccountError(401, "Sign in to manage your account.");
    const userId = session.user.id;
    if (
      request.method !== "GET" &&
      request.headers.get("x-wikigems-account") !== userId
    ) {
      throw new AccountError(
        409,
        "Your active account changed. Reload this page before saving.",
      );
    }

    if (
      url.pathname.startsWith("/api/profile/avatar/") &&
      request.method === "GET"
    ) {
      const targetId = decodeURIComponent(
        url.pathname.slice("/api/profile/avatar/".length),
      );
      const row = await db
        .selectFrom("account_profiles")
        .select("avatarKey")
        .where("userId", "=", targetId)
        .executeTakeFirst();
      if (
        !row?.avatarKey ||
        (url.searchParams.has("v") &&
          url.searchParams.get("v") !== row.avatarKey.slice("avatars/".length))
      ) {
        throw new AccountError(404, "No profile picture.");
      }
      const object = await env.AVATARS.get(row.avatarKey);
      if (!object) throw new AccountError(404, "No profile picture.");
      const headers = new Headers({
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        etag: object.httpEtag,
      });
      object.writeHttpMetadata(headers);
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/profile/username") {
      if (request.method === "GET") {
        const username = validated(() =>
          normalizeUsername(url.searchParams.get("username") ?? ""),
        );
        const owner = await db
          .selectFrom("account_profiles")
          .select("userId")
          .where("username", "=", username)
          .executeTakeFirst();
        return json({ username, available: !owner });
      }
      if (request.method === "POST") {
        const body = await decodeJson(
          request,
          Schema.decodeUnknownSync(ReserveUsernameSchema),
        );
        const username = validated(() => normalizeUsername(body.username));
        try {
          await db
            .insertInto("account_profiles")
            .values({ userId, username })
            .onConflict((conflict) =>
              conflict
                .column("userId")
                .doUpdateSet({ username })
                .where("account_profiles.username", "is", null),
            )
            .execute();
        } catch (error) {
          const owner = await db
            .selectFrom("account_profiles")
            .select("userId")
            .where("username", "=", username)
            .executeTakeFirst();
          if (owner)
            throw new AccountError(409, "This username is already taken.");
          throw error;
        }
        const profile = await db
          .selectFrom("account_profiles")
          .select("username")
          .where("userId", "=", userId)
          .executeTakeFirstOrThrow();
        if (profile.username !== username)
          throw new AccountError(
            409,
            "This account has already reserved a username.",
          );
        return json({ username });
      }
    }

    if (url.pathname === "/api/profile" && request.method === "PATCH") {
      const body = await decodeJson(
        request,
        Schema.decodeUnknownSync(UpdateSocialSchema),
      );
      const xHandle = validated(() => normalizeXHandle(body.xHandle));
      await db
        .insertInto("account_profiles")
        .values({ userId, xHandle })
        .onConflict((conflict) =>
          conflict.column("userId").doUpdateSet({ xHandle }),
        )
        .execute();
      return json({ xHandle });
    }

    if (
      url.pathname === "/api/profile/avatar" &&
      ["PUT", "DELETE"].includes(request.method)
    ) {
      const bytes =
        request.method === "PUT"
          ? await readBody(request, MAX_AVATAR_BYTES)
          : null;
      const mime = bytes ? validated(() => avatarMime(bytes)) : null;
      const image = await changeAvatar({
        db,
        bucket: env.AVATARS,
        userId,
        picture: bytes && mime ? { bytes, mime } : null,
      });
      return json({ image });
    }

    if (url.pathname === "/api/profile" && request.method === "GET") {
      const profile = await db
        .selectFrom("account_profiles")
        .select(["username", "xHandle", "avatarKey"])
        .where("userId", "=", userId)
        .executeTakeFirst();
      return json({
        userId,
        username: profile?.username ?? null,
        xHandle: profile?.xHandle ?? null,
        image: profile?.avatarKey ? avatarUrl(userId, profile.avatarKey) : null,
      });
    }
    throw new AccountError(404, "No such account route.");
  } catch (error) {
    if (error instanceof AccountError)
      return json({ error: error.message }, error.status);
    console.error("Account operation failed", error);
    return json(
      {
        error:
          "Could not confirm the account operation. Reload the page and try again.",
      },
      503,
    );
  } finally {
    await db.destroy();
  }
}
