import type { Pulse, Ticker, WikiEntry } from "./domain";

export const entries: readonly WikiEntry[] = [
  {
    id: "ai-capex-second-derivative",
    ticker: "NVDA",
    title: "The second derivative of AI capex",
    standfirst:
      "Hyperscaler guidance is still rising, but the rate of surprise is flattening. We map the four signals that matter before the next print.",
    sector: "AI & compute",
    stance: "long",
    conviction: 82,
    price: 184.62,
    change: 2.41,
    updated: "14 min ago",
    contributors: 38,
    readMinutes: 6,
    tags: ["capex", "semis", "earnings"],
    spark: [41, 44, 43, 47, 46, 52, 51, 55, 60, 58, 63, 67, 66, 72],
    author: { name: "Mara Chen", handle: "marachen", initials: "MC" },
  },
  {
    id: "grid-bottleneck-trade",
    ticker: "ETN",
    title: "The grid is the trade, not the turbine",
    standfirst:
      "Power demand forecasts keep moving right. The bottleneck has moved from generation to interconnection — and the pricing power moved with it.",
    sector: "Energy",
    stance: "long",
    conviction: 74,
    price: 342.18,
    change: 1.12,
    updated: "38 min ago",
    contributors: 21,
    readMinutes: 8,
    tags: ["grid", "utilities", "capex"],
    spark: [32, 35, 34, 38, 41, 40, 44, 47, 45, 50, 49, 54, 57, 59],
    author: { name: "Jon Bell", handle: "jonbell", initials: "JB" },
  },
  {
    id: "stablecoin-rail-margin",
    ticker: "COIN",
    title: "Stablecoins are becoming a toll road",
    standfirst:
      "The interesting number is not volume. It is take rate per settlement dollar. We break down the three rails competing for the same flow.",
    sector: "Digital assets",
    stance: "watch",
    conviction: 61,
    price: 298.4,
    change: -0.84,
    updated: "1 hr ago",
    contributors: 17,
    readMinutes: 5,
    tags: ["stablecoins", "payments", "regulation"],
    spark: [58, 54, 56, 51, 49, 52, 48, 46, 49, 47, 43, 45, 42, 44],
    author: { name: "Priya Nair", handle: "priyanair", initials: "PN" },
  },
  {
    id: "duration-shock-absorbers",
    ticker: "TLT",
    title: "Who is actually absorbing duration?",
    standfirst:
      "Positioning surveys say one thing; the basis says another. A practical framework for reading the new buyers of long-end risk.",
    sector: "Rates",
    stance: "short",
    conviction: 57,
    price: 88.21,
    change: -1.34,
    updated: "2 hrs ago",
    contributors: 12,
    readMinutes: 7,
    tags: ["duration", "positioning", "macro"],
    spark: [61, 59, 60, 56, 54, 55, 52, 50, 48, 51, 47, 45, 43, 41],
    author: { name: "Theo Grant", handle: "theogrant", initials: "TG" },
  },
  {
    id: "value-retail-rebound",
    ticker: "WMT",
    title: "The value retail rebound has a quality problem",
    standfirst:
      "Trade-down behavior is real. The margin story is not evenly distributed. We separate traffic winners from promotional losers.",
    sector: "Consumer",
    stance: "watch",
    conviction: 66,
    price: 102.77,
    change: 0.53,
    updated: "3 hrs ago",
    contributors: 9,
    readMinutes: 4,
    tags: ["retail", "margins", "consumer"],
    spark: [44, 46, 45, 48, 50, 49, 51, 53, 54, 53, 56, 57, 59, 58],
    author: { name: "Lena Ortiz", handle: "lenaortiz", initials: "LO" },
  },
];

export const tickers: readonly Ticker[] = [
  { symbol: "SPX", price: "6,812.44", change: 0.64 },
  { symbol: "NDX", price: "25,104.18", change: 1.02 },
  { symbol: "NVDA", price: "184.62", change: 2.41 },
  { symbol: "ETN", price: "342.18", change: 1.12 },
  { symbol: "COIN", price: "298.40", change: -0.84 },
  { symbol: "TLT", price: "88.21", change: -1.34 },
  { symbol: "WMT", price: "102.77", change: 0.53 },
  { symbol: "VIX", price: "14.08", change: -3.21 },
];

export const pulse: Pulse = {
  asOf: "Fri, Oct 17 · 16:20 CET",
  breadth: 64,
  regime: "Risk-on, narrow leadership",
  tickers,
  sectors: [
    { name: "AI & compute", change: 2.41, conviction: 82, notes: 164 },
    { name: "Energy", change: 1.12, conviction: 74, notes: 91 },
    { name: "Digital assets", change: -0.84, conviction: 61, notes: 77 },
    { name: "Rates", change: -1.34, conviction: 57, notes: 48 },
    { name: "Consumer", change: 0.53, conviction: 66, notes: 63 },
  ],
  stats: {
    theses: "1,204",
    contributors: "8,431",
    hitRate: "61.8%",
  },
};

export function getEntry(entryId: string): WikiEntry | undefined {
  return entries.find((entry) => entry.id === entryId);
}
