import { Schema } from "effect";

export const SectorSchema = Schema.Literals([
  "AI & compute",
  "Energy",
  "Digital assets",
  "Rates",
  "Consumer",
]);

export const StanceSchema = Schema.Literals(["long", "short", "watch"]);

export const AuthorSchema = Schema.Struct({
  name: Schema.String,
  handle: Schema.String,
  initials: Schema.String,
});

export const WikiEntrySchema = Schema.Struct({
  id: Schema.String,
  ticker: Schema.String,
  title: Schema.String,
  standfirst: Schema.String,
  sector: SectorSchema,
  stance: StanceSchema,
  conviction: Schema.Number,
  price: Schema.Number,
  change: Schema.Number,
  updated: Schema.String,
  contributors: Schema.Number,
  readMinutes: Schema.Number,
  tags: Schema.Array(Schema.String),
  spark: Schema.Array(Schema.Number),
  author: AuthorSchema,
});

export type Sector = typeof SectorSchema.Type;
export type Stance = typeof StanceSchema.Type;
export type Author = typeof AuthorSchema.Type;
export type WikiEntry = typeof WikiEntrySchema.Type;

export const TickerSchema = Schema.Struct({
  symbol: Schema.String,
  price: Schema.String,
  change: Schema.Number,
});

export type Ticker = typeof TickerSchema.Type;

export const SectorPulseSchema = Schema.Struct({
  name: SectorSchema,
  change: Schema.Number,
  conviction: Schema.Number,
  notes: Schema.Number,
});

export const PulseSchema = Schema.Struct({
  asOf: Schema.String,
  breadth: Schema.Number,
  regime: Schema.String,
  tickers: Schema.Array(TickerSchema),
  sectors: Schema.Array(SectorPulseSchema),
  stats: Schema.Struct({
    theses: Schema.String,
    contributors: Schema.String,
    hitRate: Schema.String,
  }),
});

export type Pulse = typeof PulseSchema.Type;

export const WikiResponseSchema = Schema.Struct({
  entries: Schema.Array(WikiEntrySchema),
  pulse: PulseSchema,
});

export type WikiResponse = typeof WikiResponseSchema.Type;

export const WatchlistResponseSchema = Schema.Struct({
  entryIds: Schema.Array(Schema.String),
});

export type WatchlistResponse = typeof WatchlistResponseSchema.Type;

export const ToggleWatchlistSchema = Schema.Struct({
  entryId: Schema.String,
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
