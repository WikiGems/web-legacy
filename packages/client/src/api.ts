import { Context, Effect, Layer, Schema } from "effect";
import {
  AccountProfileSchema,
  UsernameAvailabilitySchema,
} from "@wikigems/domain/account";
import {
  CardSchema,
  CreateTradeSchema,
  DuelResultSchema,
  GameStateSchema,
  LeaderboardResponseSchema,
  MarketResponseSchema,
  ClaimSchema,
  ListingResponseSchema,
  MarketConfigSchema,
  PurchaseSchema,
  PayoutSetupSchema,
  WalletBalanceSchema,
  type PrepareClaimSchema,
  type PreparePurchaseSchema,
  type SetListingSchema,
  type SubmitSignatureSchema,
  OnboardingRequestSchema,
  OnboardingResponseSchema,
  OpenPackResponseSchema,
  ToggleTradeSchema,
  TradesResponseSchema,
  WalletChallengeSchema,
  WalletLinkSchema,
} from "@wikigems/domain/domain";

export class ApiError extends Error {
  readonly _tag = "ApiError";

  constructor(
    message: string,
    readonly status = 0,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseURL: string;
  fetch: typeof globalThis.fetch;
}

export function createApiClient(options: ApiClientOptions) {
  const { fetch: fetcher } = options;
  const requestJson = (url: string, init?: RequestInit) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetcher(new URL(url, options.baseURL), {
          ...init,
          signal,
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...init?.headers,
          },
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : `Request failed (${response.status})`;
          const code =
            payload && typeof payload === "object" && "code" in payload
              ? String(payload.code)
              : undefined;
          throw new ApiError(message, response.status, code);
        }

        return payload;
      },
      catch: (error) =>
        error instanceof ApiError
          ? error
          : new ApiError(
              "The archive could not be reached. Check your connection.",
            ),
    });

  const decode = <S extends Schema.Constraint>(schema: S, input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(
        () => new ApiError("The archive returned an unexpected response."),
      ),
    );

  const sessionUser = Schema.Struct({
    user: Schema.Struct({ id: Schema.String }),
  });
  const writeAsActiveAccount = (url: string, init: RequestInit) =>
    Effect.gen(function* () {
      const session = yield* requestJson("/api/auth/get-session");
      if (!session)
        return yield* Effect.fail(
          new ApiError("Sign in to continue.", 401, "UNAUTHORIZED"),
        );
      const { user } = yield* decode(sessionUser, session);
      return yield* requestJson(url, {
        ...init,
        headers: { ...init.headers, "x-wikigems-account": user.id },
      });
    });

  const fetchGameState = () =>
    Effect.gen(function* () {
      const payload = yield* requestJson("/api/game/state");
      return yield* decode(GameStateSchema, payload);
    });

  const openPack = () =>
    Effect.gen(function* () {
      const payload = yield* requestJson("/api/packs/open", {
        method: "POST",
        body: "{}",
      });
      return yield* decode(OpenPackResponseSchema, payload);
    });

  const fetchMarket = () =>
    Effect.gen(function* () {
      const payload = yield* requestJson("/api/market");
      return yield* decode(MarketResponseSchema, payload);
    });

  const fetchTrades = () =>
    Effect.gen(function* () {
      const payload = yield* requestJson("/api/trades");
      return yield* decode(TradesResponseSchema, payload);
    });

  const createTradeOffer = (offeredCardId: string, requestedCardId: string) =>
    Effect.gen(function* () {
      const body = yield* decode(CreateTradeSchema, {
        offeredCardId,
        requestedCardId,
      });
      return yield* writeAsActiveAccount("/api/trades", {
        method: "POST",
        body: JSON.stringify(body),
      });
    });

  const settleTrade = (
    tradeId: string,
    action: "accept" | "decline" | "cancel",
  ) =>
    writeAsActiveAccount(`/api/trades/${tradeId}/${action}`, {
      method: "POST",
      body: "{}",
    });

  const toggleCardTrade = (cardId: string, forTrade: boolean) =>
    Effect.gen(function* () {
      const body = yield* decode(ToggleTradeSchema, { forTrade });
      const payload = yield* writeAsActiveAccount(
        `/api/cards/${cardId}/trade`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      return yield* decode(CardSchema, payload);
    });

  const read = <S extends Schema.Constraint>(url: string, schema: S) =>
    requestJson(url).pipe(Effect.flatMap((payload) => decode(schema, payload)));

  const write = <S extends Schema.Constraint>(
    url: string,
    schema: S,
    userId: string | undefined,
    body?: object,
  ) =>
    userId
      ? requestJson(url, {
          method: "POST",
          body: body && JSON.stringify(body),
          headers: { "x-wikigems-account": userId },
        }).pipe(Effect.flatMap((payload) => decode(schema, payload)))
      : Effect.fail(new ApiError("Sign in to continue.", 401, "UNAUTHORIZED"));

  const fetchMarketConfig = () =>
    read("/api/market/config", MarketConfigSchema);
  const fetchWalletBalance = () =>
    read("/api/wallet/balance", WalletBalanceSchema);

  const setupPayouts = (userId: string | undefined) =>
    write("/api/wallet/payouts", PayoutSetupSchema, userId);

  const setListing = (
    cardId: string,
    input: typeof SetListingSchema.Type,
    userId: string | undefined,
  ) =>
    write(
      `/api/cards/${encodeURIComponent(cardId)}/listing`,
      ListingResponseSchema,
      userId,
      input,
    );

  const preparePurchase = (
    input: typeof PreparePurchaseSchema.Type,
    userId: string | undefined,
  ) => write("/api/purchases", PurchaseSchema, userId, input);

  const purchaseStatus = (
    id: string,
    userId: string | undefined,
    input?: typeof SubmitSignatureSchema.Type,
  ) =>
    write(
      `/api/purchases/${encodeURIComponent(id)}${input ? "/sign" : ""}`,
      PurchaseSchema,
      userId,
      input,
    );

  const prepareClaim = (
    cardId: string,
    input: typeof PrepareClaimSchema.Type,
    userId: string | undefined,
  ) =>
    write(
      `/api/cards/${encodeURIComponent(cardId)}/claim`,
      ClaimSchema,
      userId,
      input,
    );

  const claimStatus = (
    id: string,
    userId: string | undefined,
    input?: typeof SubmitSignatureSchema.Type,
  ) =>
    write(
      `/api/claims/${encodeURIComponent(id)}${input ? "/sign" : ""}`,
      ClaimSchema,
      userId,
      input,
    );

  const fetchLeaderboard = () =>
    Effect.gen(function* () {
      const payload = yield* requestJson("/api/leaderboard");
      return yield* decode(LeaderboardResponseSchema, payload);
    });

  const requestWalletChallenge = (wallet: string) =>
    Effect.gen(function* () {
      const payload = yield* writeAsActiveAccount(
        `/api/wallet/challenge?wallet=${encodeURIComponent(wallet)}`,
        { method: "POST" },
      );
      return yield* decode(WalletChallengeSchema, payload);
    });

  const linkWallet = (walletAddress: string, signature: string) =>
    Effect.gen(function* () {
      const body = yield* decode(WalletLinkSchema, {
        walletAddress,
        signature,
      });
      return yield* writeAsActiveAccount("/api/wallet/link", {
        method: "POST",
        body: JSON.stringify(body),
      });
    });

  const recordDuel = (won: boolean) =>
    Effect.gen(function* () {
      const body = yield* decode(DuelResultSchema, { won });
      return yield* requestJson("/api/duels/result", {
        method: "POST",
        body: JSON.stringify(body),
      });
    });

  const fetchOnboardingContext = (name: string, email: string) =>
    Effect.gen(function* () {
      const body = yield* decode(OnboardingRequestSchema, { name, email });
      const payload = yield* requestJson("/api/onboarding/context", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return yield* decode(OnboardingResponseSchema, payload);
    });

  const fetchAccountProfile = () =>
    requestJson("/api/profile").pipe(
      Effect.flatMap((payload) => decode(AccountProfileSchema, payload)),
    );

  const checkUsername = (username: string) =>
    requestJson(
      `/api/profile/username?username=${encodeURIComponent(username)}`,
    ).pipe(
      Effect.flatMap((payload) => decode(UsernameAvailabilitySchema, payload)),
    );

  const reserveUsername = (username: string, userId: string) =>
    requestJson("/api/profile/username", {
      method: "POST",
      body: JSON.stringify({ username }),
      headers: { "x-wikigems-account": userId },
    });

  const saveXHandle = (xHandle: string, userId: string) =>
    requestJson("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ xHandle }),
      headers: { "x-wikigems-account": userId },
    });

  const uploadAvatar = (picture: Blob, userId: string) =>
    requestJson("/api/profile/avatar", {
      method: "PUT",
      body: picture,
      headers: { "content-type": picture.type, "x-wikigems-account": userId },
    });

  const removeAvatar = (userId: string) =>
    requestJson("/api/profile/avatar", {
      method: "DELETE",
      headers: { "x-wikigems-account": userId },
    });

  return {
    fetchGameState,
    openPack,
    fetchMarket,
    fetchTrades,
    createTradeOffer,
    settleTrade,
    toggleCardTrade,
    fetchMarketConfig,
    fetchWalletBalance,
    setupPayouts,
    setListing,
    preparePurchase,
    purchaseStatus,
    prepareClaim,
    claimStatus,
    fetchLeaderboard,
    requestWalletChallenge,
    linkWallet,
    recordDuel,
    fetchOnboardingContext,
    fetchAccountProfile,
    checkUsername,
    reserveUsername,
    saveXHandle,
    uploadAvatar,
    removeAvatar,
  };
}

export function runApi<A>(
  effect: Effect.Effect<A, ApiError>,
  options?: { signal?: AbortSignal },
): Promise<A> {
  return Effect.runPromise(effect, options);
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * The HTTP client as an Effect service. Provide it once per platform with a
 * transport; every consumer asks for `Api` and never sees a browser origin.
 */
export class Api extends Context.Service<Api, ApiClient>()(
  "@wikigems/client/Api",
) {
  static layer(options: ApiClientOptions) {
    return Layer.succeed(Api, Api.of(createApiClient(options)));
  }
}
