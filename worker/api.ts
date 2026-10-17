import { Effect, Schema } from "effect";
import { entries, pulse, getEntry } from "../shared/content";
import {
  OnboardingRequestSchema,
  ToggleWatchlistSchema,
  WatchlistResponseSchema,
  type WatchlistResponse,
} from "../shared/domain";
import type { WikiTradeAuth } from "./auth";
import { createDb } from "./db";
import type { Env } from "./env";
import {
  createOnboardingToken,
  isValidEmail,
  isValidName,
  normaliseEmail,
} from "./onboarding";

class HttpError extends Error {
  readonly _tag = "HttpError";

  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });

const errorResponse = (error: unknown) => {
  if (error instanceof HttpError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("Unhandled API error", error);
  return json({ error: "Something went wrong on the desk." }, 500);
};

const decodeBody = <A>(request: Request, parse: (input: unknown) => A): Effect.Effect<A, HttpError> =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: () => new HttpError(400, "Expected a JSON request body."),
  }).pipe(
    Effect.flatMap((body) =>
      Effect.try({
        try: () => parse(body),
        catch: () => new HttpError(400, "The request body is not valid."),
      }),
    ),
  );

const requireSession = (auth: WikiTradeAuth, request: Request) =>
  Effect.tryPromise({
    try: () => auth.api.getSession({ headers: request.headers }),
    catch: () => new HttpError(500, "Could not reach the session service."),
  }).pipe(
    Effect.flatMap((session) =>
      session
        ? Effect.succeed(session)
        : Effect.fail(new HttpError(401, "Sign in with a passkey to use your desk.", "UNAUTHORIZED")),
    ),
  );

const databaseOperation = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (error) => {
      console.error("Database operation failed", error);
      return new HttpError(503, "The research database is unavailable.", "DATABASE_UNAVAILABLE");
    },
  });

export async function handleApi(
  request: Request,
  env: Env,
  auth: WikiTradeAuth,
): Promise<Response> {
  const url = new URL(request.url);
  const db = createDb(env);

  const program = Effect.gen(function* () {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "wikitrade", database: "turso" });
    }

    if (url.pathname === "/api/wiki" && request.method === "GET") {
      return json({ entries, pulse });
    }

    if (url.pathname === "/api/onboarding/context" && request.method === "POST") {
      const body = yield* decodeBody(request, Schema.decodeUnknownSync(OnboardingRequestSchema));
      const name = body.name.trim();
      const email = normaliseEmail(body.email);

      if (!isValidName(name)) {
        return yield* Effect.fail(
          new HttpError(400, "Use a display name between 2 and 80 characters.", "INVALID_NAME"),
        );
      }
      if (!isValidEmail(email)) {
        return yield* Effect.fail(new HttpError(400, "Enter a valid email address.", "INVALID_EMAIL"));
      }

      const context = yield* Effect.tryPromise({
        try: () => auth.$context,
        catch: () => new HttpError(500, "Could not prepare passkey registration."),
      });
      const existing = yield* databaseOperation(() => context.internalAdapter.findUserByEmail(email));
      if (existing) {
        return yield* Effect.fail(
          new HttpError(
            409,
            "An account already exists for this email. Sign in with your passkey instead.",
            "ACCOUNT_EXISTS",
          ),
        );
      }

      const token = yield* Effect.tryPromise({
        try: () =>
          createOnboardingToken(env.BETTER_AUTH_SECRET, {
            sub: crypto.randomUUID(),
            name,
            email,
          }),
        catch: () => new HttpError(500, "Could not create a registration pass."),
      });

      return json({ context: token.token, expiresIn: token.expiresIn });
    }

    if (url.pathname === "/api/watchlist" && request.method === "GET") {
      const session = yield* requireSession(auth, request);
      const rows = yield* databaseOperation(() =>
        db
          .selectFrom("watchlist")
          .select("entryId")
          .where("userId", "=", session.user.id)
          .orderBy("createdAt", "desc")
          .execute(),
      );
      return json({ entryIds: rows.map((row) => row.entryId) } satisfies WatchlistResponse);
    }

    if (url.pathname === "/api/watchlist" && request.method === "PUT") {
      const session = yield* requireSession(auth, request);
      const body = yield* decodeBody(request, Schema.decodeUnknownSync(ToggleWatchlistSchema));
      if (!getEntry(body.entryId)) {
        return yield* Effect.fail(new HttpError(404, "That research note does not exist.", "NOT_FOUND"));
      }

      const existing = yield* databaseOperation(() =>
        db
          .selectFrom("watchlist")
          .select("id")
          .where("userId", "=", session.user.id)
          .where("entryId", "=", body.entryId)
          .executeTakeFirst(),
      );

      if (existing) {
        yield* databaseOperation(() =>
          db.deleteFrom("watchlist").where("id", "=", existing.id).execute(),
        );
        return json({ watching: false, entryId: body.entryId });
      }

      yield* databaseOperation(() =>
        db
          .insertInto("watchlist")
          .values({
            id: crypto.randomUUID(),
            userId: session.user.id,
            entryId: body.entryId,
            createdAt: Date.now(),
          })
          .execute(),
      );
      return json({ watching: true, entryId: body.entryId });
    }

    return yield* Effect.fail(new HttpError(404, "No such API route.", "NOT_FOUND"));
  }).pipe(Effect.catch((error) => Effect.succeed(errorResponse(error))));

  try {
    return await Effect.runPromise(program);
  } finally {
    await db.destroy();
  }
}
