import { createApiClient, createQueries } from "@wikigems/client";
export { ApiError, runApi } from "@wikigems/client";

export const api = createApiClient({
  baseURL: window.location.origin,
  fetch: globalThis.fetch.bind(globalThis),
});
export const queries = createQueries(api);
export const {
  fetchGameState,
  openPack,
  fetchMarket,
  fetchTrades,
  createTradeOffer,
  settleTrade,
  toggleCardTrade,
  confirmCardMint,
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
} = api;
