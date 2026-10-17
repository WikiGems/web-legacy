import { Schema } from "effect";

export const RaritySchema = Schema.Literals([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
]);

export type Rarity = typeof RaritySchema.Type;

export const CardStatusSchema = Schema.Literals(["claimed", "minted"]);
export type CardStatus = typeof CardStatusSchema.Type;

export const CardSchema = Schema.Struct({
  id: Schema.String,
  articleId: Schema.String,
  title: Schema.String,
  description: Schema.String,
  extract: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  articleUrl: Schema.String,
  category: Schema.String,
  rarity: RaritySchema,
  attack: Schema.Number,
  defense: Schema.Number,
  pageviews: Schema.Number,
  status: CardStatusSchema,
  mintAddress: Schema.NullOr(Schema.String),
  txSignature: Schema.NullOr(Schema.String),
  forTrade: Schema.Boolean,
  ownerName: Schema.optionalKey(Schema.String),
  createdAt: Schema.Number,
  mintedAt: Schema.NullOr(Schema.Number),
});

export type Card = typeof CardSchema.Type;

export const ProfileSchema = Schema.Struct({
  walletAddress: Schema.NullOr(Schema.String),
  packStock: Schema.Number,
  nextPackAt: Schema.NullOr(Schema.Number),
  duelWins: Schema.Number,
  duelLosses: Schema.Number,
});

export type Profile = typeof ProfileSchema.Type;

export const GameStateSchema = Schema.Struct({
  user: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  }),
  profile: ProfileSchema,
  cards: Schema.Array(CardSchema),
  stats: Schema.Struct({
    owned: Schema.Number,
    minted: Schema.Number,
    tradeable: Schema.Number,
    rank: Schema.Number,
  }),
});

export type GameState = typeof GameStateSchema.Type;

export const OpenPackResponseSchema = Schema.Struct({
  cards: Schema.Array(CardSchema),
  packStock: Schema.Number,
  nextPackAt: Schema.NullOr(Schema.Number),
});

export type OpenPackResponse = typeof OpenPackResponseSchema.Type;

export const MarketResponseSchema = Schema.Struct({
  cards: Schema.Array(CardSchema),
});

export type MarketResponse = typeof MarketResponseSchema.Type;

export const TradeSchema = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["proposed", "settled", "declined", "cancelled"]),
  offeredCard: CardSchema,
  requestedCard: CardSchema,
  proposerName: Schema.String,
  counterpartyName: Schema.String,
  createdAt: Schema.Number,
});

export type Trade = typeof TradeSchema.Type;

export const TradesResponseSchema = Schema.Struct({
  incoming: Schema.Array(TradeSchema),
  outgoing: Schema.Array(TradeSchema),
});

export type TradesResponse = typeof TradesResponseSchema.Type;

export const LeaderboardEntrySchema = Schema.Struct({
  rank: Schema.Number,
  name: Schema.String,
  cards: Schema.Number,
  minted: Schema.Number,
  duelWins: Schema.Number,
});

export const LeaderboardResponseSchema = Schema.Struct({
  entries: Schema.Array(LeaderboardEntrySchema),
});

export type LeaderboardResponse = typeof LeaderboardResponseSchema.Type;

export const WalletChallengeSchema = Schema.Struct({
  message: Schema.String,
  nonce: Schema.String,
  expiresAt: Schema.Number,
});

export type WalletChallenge = typeof WalletChallengeSchema.Type;

export const WalletLinkSchema = Schema.Struct({
  walletAddress: Schema.String,
  signature: Schema.String,
});

export const MintConfirmSchema = Schema.Struct({
  mintAddress: Schema.String,
  signature: Schema.String,
  walletAddress: Schema.String,
});

export const ToggleTradeSchema = Schema.Struct({
  forTrade: Schema.Boolean,
});

export const CreateTradeSchema = Schema.Struct({
  offeredCardId: Schema.String,
  requestedCardId: Schema.String,
});

export const DuelResultSchema = Schema.Struct({
  won: Schema.Boolean,
});

export const OnboardingRequestSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
});

export const OnboardingResponseSchema = Schema.Struct({
  context: Schema.String,
  expiresIn: Schema.Number,
});

export type OnboardingResponse = typeof OnboardingResponseSchema.Type;

export const ApiErrorSchema = Schema.Struct({
  error: Schema.String,
  code: Schema.optionalKey(Schema.String),
});

export interface FeaturedArticle {
  articleId: string;
  title: string;
  description: string;
  extract: string;
  imageUrl: string | null;
  articleUrl: string;
  category: string;
  pageviews: number;
  wikiSlug: string;
}

export interface CardDraft {
  articleId: string;
  title: string;
  description: string;
  extract: string;
  imageUrl: string | null;
  articleUrl: string;
  category: string;
  rarity: Rarity;
  attack: number;
  defense: number;
  pageviews: number;
}
