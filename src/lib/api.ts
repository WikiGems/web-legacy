import { Effect, Schema } from "effect";
import {
  CardSchema,
  CreateTradeSchema,
  DuelResultSchema,
  GameStateSchema,
  LeaderboardResponseSchema,
  MarketResponseSchema,
  MintConfirmSchema,
  OnboardingRequestSchema,
  OnboardingResponseSchema,
  OpenPackResponseSchema,
  ToggleTradeSchema,
  TradesResponseSchema,
  WalletChallengeSchema,
  WalletLinkSchema,
  type GameState,
  type LeaderboardResponse,
  type MarketResponse,
  type OpenPackResponse,
  type TradesResponse,
} from "../../shared/domain";

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

const requestJson = (url: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...init?.headers,
        },
      });
      const payload = (await response.json().catch(() => null)) as
        { error?: string; code?: string } | null | unknown;

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

export const fetchGameState = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/game/state");
    return (yield* decode(GameStateSchema, payload)) as GameState;
  });

export const openPack = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/packs/open", {
      method: "POST",
      body: "{}",
    });
    return (yield* decode(OpenPackResponseSchema, payload)) as OpenPackResponse;
  });

export const fetchMarket = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/market");
    return (yield* decode(MarketResponseSchema, payload)) as MarketResponse;
  });

export const fetchTrades = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/trades");
    return (yield* decode(TradesResponseSchema, payload)) as TradesResponse;
  });

export const createTradeOffer = (
  offeredCardId: string,
  requestedCardId: string,
) =>
  Effect.gen(function* () {
    const body = yield* decode(CreateTradeSchema, {
      offeredCardId,
      requestedCardId,
    });
    return yield* requestJson("/api/trades", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

export const settleTrade = (
  tradeId: string,
  action: "accept" | "decline" | "cancel",
) =>
  requestJson(`/api/trades/${tradeId}/${action}`, {
    method: "POST",
    body: "{}",
  });

export const toggleCardTrade = (cardId: string, forTrade: boolean) =>
  Effect.gen(function* () {
    const body = yield* decode(ToggleTradeSchema, { forTrade });
    const payload = yield* requestJson(`/api/cards/${cardId}/trade`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return yield* decode(CardSchema, payload);
  });

export const confirmCardMint = (
  cardId: string,
  input: { mintAddress: string; signature: string; walletAddress: string },
) =>
  Effect.gen(function* () {
    const body = yield* decode(MintConfirmSchema, input);
    const payload = yield* requestJson(`/api/cards/${cardId}/mint-confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return yield* decode(CardSchema, payload);
  });

export const fetchLeaderboard = () =>
  Effect.gen(function* () {
    const payload = yield* requestJson("/api/leaderboard");
    return (yield* decode(
      LeaderboardResponseSchema,
      payload,
    )) as LeaderboardResponse;
  });

export const requestWalletChallenge = (wallet: string) =>
  Effect.gen(function* () {
    const payload = yield* requestJson(
      `/api/wallet/challenge?wallet=${encodeURIComponent(wallet)}`,
    );
    return yield* decode(WalletChallengeSchema, payload);
  });

export const linkWallet = (walletAddress: string, signature: string) =>
  Effect.gen(function* () {
    const body = yield* decode(WalletLinkSchema, { walletAddress, signature });
    return yield* requestJson("/api/wallet/link", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

export const recordDuel = (won: boolean) =>
  Effect.gen(function* () {
    const body = yield* decode(DuelResultSchema, { won });
    return yield* requestJson("/api/duels/result", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

export const fetchOnboardingContext = (name: string, email: string) =>
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
