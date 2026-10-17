import { Effect, Schema } from "effect";
import {
  OnboardingRequestSchema,
  OnboardingResponseSchema,
  ToggleWatchlistSchema,
  WikiResponseSchema,
  WatchlistResponseSchema,
} from "../../shared/domain";

export class ApiError extends Error {
  readonly _tag = "ApiError";

  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const requestJson = (url: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
        | unknown;

      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : `Request failed (${response.status})`;
        throw new ApiError(message, response.status);
      }

      return payload;
    },
    catch: (error) =>
      error instanceof ApiError ? error : new ApiError("The desk could not be reached. Try again."),
  });

const decode = <S extends Schema.Constraint>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() => new ApiError("The desk returned an unexpected response.")),
  );

export const fetchWiki = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/wiki");
    return yield* decode(WikiResponseSchema, payload);
  });

export const fetchWatchlist = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/watchlist");
    return yield* decode(WatchlistResponseSchema, payload);
  });

export const toggleWatchlist = (entryId: string) =>
  Effect.gen(function* () {
    const body = yield* decode(ToggleWatchlistSchema, { entryId });
    const payload = yield* requestJson("/api/watchlist", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return yield* decode(
      Schema.Struct({
        watching: Schema.Boolean,
        entryId: Schema.String,
      }),
      payload,
    );
  });

export const requestOnboardingContext = (name: string, email: string) =>
  Effect.gen(function* () {
    const body = yield* decode(OnboardingRequestSchema, { name, email });
    const payload = yield* requestJson("/api/onboarding/context", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return yield* decode(OnboardingResponseSchema, payload);
  });

export function runApi<A>(effect: Effect.Effect<A, ApiError>): Promise<A> {
  return Effect.runPromise(effect);
}
