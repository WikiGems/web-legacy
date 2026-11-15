import { queryOptions } from "@tanstack/react-query";
import { runApi, type ApiClient } from "./api";
import { searchWikipedia } from "./wikipedia";

// A user id is part of every private cache key. No account shares another's data.
export function createQueries(api: ApiClient) {
  return {
    profile: (userId: string) =>
      queryOptions({
        queryKey: ["account", userId, "profile"],
        queryFn: ({ signal }) => runApi(api.fetchAccountProfile(), { signal }),
        enabled: Boolean(userId),
      }),
    game: (userId: string) =>
      queryOptions({
        queryKey: ["account", userId, "game"],
        queryFn: ({ signal }) => runApi(api.fetchGameState(), { signal }),
        enabled: Boolean(userId),
      }),
    trades: (userId: string) =>
      queryOptions({
        queryKey: ["account", userId, "trades"],
        queryFn: ({ signal }) => runApi(api.fetchTrades(), { signal }),
        enabled: Boolean(userId),
      }),
    market: () =>
      queryOptions({
        queryKey: ["market"],
        queryFn: ({ signal }) => runApi(api.fetchMarket(), { signal }),
      }),
    leaderboard: () =>
      queryOptions({
        queryKey: ["leaderboard"],
        queryFn: ({ signal }) => runApi(api.fetchLeaderboard(), { signal }),
      }),
  };
}

export function articleSearchOptions(
  term: string,
  fetch: typeof globalThis.fetch,
) {
  return queryOptions({
    queryKey: ["wikipedia", term],
    queryFn: ({ signal }) => searchWikipedia({ term, fetch, signal }),
    enabled: Boolean(term),
    staleTime: 60_000,
    retry: false,
  });
}
