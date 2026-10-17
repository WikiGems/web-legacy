import { useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js";
import type { Card, GameState, LeaderboardResponse, Rarity, Trade, TradesResponse } from "../../shared/domain";
import { RARITY_META, explorerAddressUrl } from "../../shared/card-engine";
import { authClient } from "../lib/auth-client";
import {
  fetchGameState,
  fetchLeaderboard,
  fetchMarket,
  fetchTrades,
  openPack,
  recordDuel,
  runApi,
  settleTrade,
} from "../lib/api";
import { duelCards as previewDuelCards } from "../lib/preview";
import {
  noteWalletLinked,
  openAuth,
  openWalletModal,
  showToast,
  walletLinkVersion,
} from "../lib/ui";
import { wallet } from "../lib/wallet";
import { CardModal } from "../components/CardModal";
import { DuelGame } from "../components/DuelGame";
import { GameCard, CardBack } from "../components/GameCard";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { PackOpening } from "../components/PackOpening";
import { TradeOfferModal } from "../components/TradeOfferModal";

type Tab = "packs" | "album" | "exchange" | "duel" | "ranking";
type AlbumFilter = "all" | "unminted" | "minted" | "trade";

const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: "packs", label: "Packs", icon: "pack" },
  { id: "album", label: "Album", icon: "cards" },
  { id: "exchange", label: "Exchange", icon: "swap" },
  { id: "duel", label: "Duel", icon: "duel" },
  { id: "ranking", label: "Ranking", icon: "trophy" },
];

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Play() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const [state, setState] = createSignal<GameState | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [tab, setTab] = createSignal<Tab>("packs");
  const [packCards, setPackCards] = createSignal<Card[] | null>(null);
  const [selectedCard, setSelectedCard] = createSignal<Card | null>(null);
  const [offerTarget, setOfferTarget] = createSignal<Card | null>(null);
  const [market, setMarket] = createSignal<Card[]>([]);
  const [trades, setTrades] = createSignal<TradesResponse>({ incoming: [], outgoing: [] });
  const [leaderboard, setLeaderboard] = createSignal<LeaderboardResponse["entries"]>([]);
  const [busy, setBusy] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const [albumSearch, setAlbumSearch] = createSignal("");
  const [albumFilter, setAlbumFilter] = createSignal<AlbumFilter>("all");
  const [rarityFilter, setRarityFilter] = createSignal<"all" | Rarity>("all");

  const user = () => session().data?.user;
  const linkedWallet = () => state()?.profile.walletAddress ?? null;
  const stock = () => state()?.profile.packStock ?? 0;

  async function loadGame(showSpinner = false) {
    if (!user()) {
      setLoading(false);
      setState(null);
      return;
    }
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    setLoadError(null);
    try {
      const [game, marketData, tradeData, leaderData] = await Promise.all([
        runApi(fetchGameState()),
        runApi(fetchMarket()),
        runApi(fetchTrades()),
        runApi(fetchLeaderboard()),
      ]);
      setState(game);
      setMarket(marketData.cards.filter((card) => !game.cards.some((owned) => owned.id === card.id)));
      setTrades(tradeData);
      setLeaderboard(leaderData.entries);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not open the archive.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  createEffect(
    on(
      () => user()?.id,
      (id) => {
        if (!id) {
          setLoading(false);
          setState(null);
          return;
        }
        void loadGame();
      },
    ),
  );

  createEffect(
    on(walletLinkVersion, () => {
      if (user()) void loadGame();
    }),
  );

  createEffect(
    on(tab, (current) => {
      if ((current === "exchange" || current === "ranking") && user()) void loadGame();
    }),
  );

  createEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(interval));
  });

  let lastRefillCheck = 0;
  createEffect(() => {
    const current = state();
    if (!current?.profile.nextPackAt) return;
    if (now() < current.profile.nextPackAt) return;
    if (Date.now() - lastRefillCheck < 15000) return;
    lastRefillCheck = Date.now();
    void loadGame();
  });

  const countdown = () => {
    const target = state()?.profile.nextPackAt;
    if (!target) return null;
    const seconds = Math.max(0, Math.ceil((target - now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const filteredCards = createMemo(() => {
    const query = albumSearch().trim().toLowerCase();
    return (state()?.cards ?? []).filter((card) => {
      if (albumFilter() === "unminted" && card.status !== "claimed") return false;
      if (albumFilter() === "minted" && card.status !== "minted") return false;
      if (albumFilter() === "trade" && !card.forTrade) return false;
      if (rarityFilter() !== "all" && card.rarity !== rarityFilter()) return false;
      if (query && !`${card.title} ${card.description} ${card.category}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  });

  const rarityCounts = createMemo(() => {
    const counts: Record<string, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 0,
    };
    for (const card of state()?.cards ?? []) counts[card.rarity] = (counts[card.rarity] ?? 0) + 1;
    return counts;
  });

  const collectionScore = createMemo(() =>
    (state()?.cards ?? []).reduce((total, card) => total + card.attack + card.defense, 0),
  );

  const duelPool = createMemo(() => {
    const owned = state()?.cards ?? [];
    return owned.length >= 4 ? owned : previewDuelCards();
  });

  async function handleOpenPack() {
    if (!user()) {
      openAuth("signup");
      return;
    }
    setBusy(true);
    try {
      const pack = await runApi(openPack());
      setPackCards([...pack.cards]);
      setState((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                packStock: pack.packStock,
                nextPackAt: pack.nextPackAt,
              },
              cards: [...pack.cards, ...current.cards],
              stats: {
                ...current.stats,
                owned: current.stats.owned + pack.cards.length,
              },
            }
          : current,
      );
      void loadGame();
    } catch (error) {
      showToast("No pack to open", {
        body: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  function updateCard(updated: Card) {
    setState((current) => {
      if (!current) return current;
      const cards = current.cards.map((card) =>
        card.id === updated.id ? { ...updated, ownerName: current.user.name } : card,
      );
      return {
        ...current,
        cards,
        stats: {
          ...current.stats,
          minted: cards.filter((card) => card.status === "minted").length,
          tradeable: cards.filter((card) => card.forTrade && card.status === "claimed").length,
        },
      };
    });
    setSelectedCard(updated);
  }

  async function handleSettleTrade(trade: Trade, action: "accept" | "decline" | "cancel") {
    setBusy(true);
    try {
      await runApi(settleTrade(trade.id, action));
      showToast(
        action === "accept" ? "Trade settled" : action === "decline" ? "Offer declined" : "Offer cancelled",
        {
          body: action === "accept" ? "Both cards moved to their new albums." : undefined,
          tone: "success",
        },
      );
      await loadGame();
    } catch (error) {
      showToast("Could not update the trade", {
        body: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function finishDuel(won: boolean, score: number) {
    try {
      await runApi(recordDuel(won));
      setState((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                duelWins: current.profile.duelWins + (won ? 1 : 0),
                duelLosses: current.profile.duelLosses + (won ? 0 : 1),
              },
            }
          : current,
      );
      showToast(won ? "Duel won" : "Duel complete", {
        body: won ? `The Librarian is sulking. ${score.toLocaleString()} points.` : "Read the pages. Run it back.",
        tone: won ? "success" : "info",
      });
    } catch {
      // The result is still shown locally if the score could not be saved.
    }
  }

  async function signOut() {
    await authClient.signOut();
    showToast("Signed out", { tone: "info" });
    navigate("/");
  }

  return (
    <div class="play-page">
      <header class="play-header">
        <div class="play-header-inner">
          <div class="play-brand">
            <Logo />
            <span class="beta-chip mono">BETA</span>
          </div>
          <nav class="play-tabs" aria-label="Game sections">
            <For each={tabs}>
              {(item) => (
                <button
                  class="play-tab"
                  classList={{ "is-active": tab() === item.id }}
                  onClick={() => setTab(item.id)}
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </button>
              )}
            </For>
          </nav>
          <div class="play-actions">
            <span class="pack-chip" title="Packs available">
              <Icon name="pack" size={15} /> {stock()}
            </span>
            <button class="wallet-chip" onClick={openWalletModal}>
              <Icon name="wallet" size={15} />
              <Show
                when={wallet()?.address}
                fallback={
                  <span>{linkedWallet() ? "Reconnect wallet" : "Connect wallet"}</span>
                }
              >
                {(address) => <span>{shortAddress(address())}</span>}
              </Show>
            </button>
            <Show when={user()}>
              {(current) => (
                <button
                  class="avatar-button avatar-button--dark"
                  onClick={signOut}
                  title={`Signed in as ${current().name}. Sign out.`}
                >
                  {initials(current().name)}
                </button>
              )}
            </Show>
          </div>
        </div>
      </header>

      <Show
        when={!loading()}
        fallback={
          <div class="play-loading">
            <span class="spinner" />
            <p class="mono">OPENING THE ARCHIVE…</p>
          </div>
        }
      >
        <Show
          when={user()}
          fallback={
            <div class="play-gate page-shell">
              <Logo />
              <p class="eyebrow">Your collector card is the key</p>
              <h1>Sign in. Pull your first page.</h1>
              <p>
                Create a passkey and the archive will hand you five Wikipedia articles. No password,
                no wallet required.
              </p>
              <div class="play-gate-actions">
                <button class="btn btn-primary btn-lg" onClick={() => openAuth("signup")}>
                  <Icon name="bolt" size={18} /> Create collector
                </button>
                <button class="btn btn-outline btn-lg" onClick={() => openAuth("signin")}>
                  Sign in with passkey
                </button>
              </div>
            </div>
          }
        >
          <Show when={state()} fallback={<div class="play-loading"><span class="spinner" /><p class="mono">SYNCING ALBUM…</p></div>}>
            {(game) => (
              <main class="play-main page-shell">
                <Show when={loadError()}>
                  <div class="load-error">
                    <Icon name="info" size={16} /> {loadError()}
                    <button class="text-link" onClick={() => loadGame(true)}>Retry</button>
                  </div>
                </Show>

                <Show when={tab() === "packs"}>
                  <section class="pack-hero">
                    <div class="pack-hero-copy">
                      <p class="eyebrow">Pack hall · {game().user.name}</p>
                      <h1>
                        Your next page
                        <br />
                        is <em>waiting.</em>
                      </h1>
                      <p class="pack-hero-lede">
                        Five random Wikipedia articles. Each one a 1-of-1 card. New pack every ten
                        minutes, up to ten in stock.
                      </p>
                      <div class="pack-meta-row">
                        <div class="pack-meta">
                          <span class="mono">PACKS READY</span>
                          <strong>{game().profile.packStock.toString().padStart(2, "0")}</strong>
                        </div>
                        <div class="pack-meta">
                          <span class="mono">NEXT PACK</span>
                          <strong>{countdown() ?? "FULL"}</strong>
                        </div>
                        <div class="pack-meta">
                          <span class="mono">COLLECTION</span>
                          <strong>{game().stats.owned}</strong>
                        </div>
                      </div>
                      <button
                        class="btn btn-primary btn-xl open-pack-button"
                        onClick={handleOpenPack}
                        disabled={busy() || game().profile.packStock < 1}
                      >
                        <Show
                          when={busy()}
                          fallback={
                            <>
                              <Icon name="pack" size={19} />
                              {game().profile.packStock > 0 ? "Tear open a pack" : "Next pack is binding"}
                            </>
                          }
                        >
                          <span class="spinner" /> Pulling from the archive…
                        </Show>
                      </button>
                      <p class="pack-fine">
                        <Icon name="lock" size={12} /> One card per article. No reprints, ever.
                      </p>
                    </div>

                    <div class="booster-stage">
                      <div class="booster-glow" />
                      <button
                        class="booster"
                        classList={{ "is-busy": busy() }}
                        onClick={handleOpenPack}
                        disabled={busy() || game().profile.packStock < 1}
                        aria-label="Open a pack"
                      >
                        <span class="booster-notch booster-notch--top" />
                        <span class="booster-brand">WIKIGEMS</span>
                        <span class="booster-emblem">W</span>
                        <span class="booster-copy">THE WIKIPEDIA CARD GAME</span>
                        <span class="booster-bottom">5 CARDS · 1 OF 1</span>
                        <span class="booster-notch booster-notch--bottom" />
                      </button>
                      <div class="booster-shadow" />
                    </div>
                  </section>

                  <section class="play-stat-row">
                    <div><span class="mono">CARDS OWNED</span><strong>{game().stats.owned}</strong></div>
                    <div><span class="mono">MINTED ON SOLANA</span><strong>{game().stats.minted}</strong></div>
                    <div><span class="mono">OPEN TO TRADE</span><strong>{game().stats.tradeable}</strong></div>
                    <div><span class="mono">COLLECTOR RANK</span><strong>#{game().stats.rank}</strong></div>
                  </section>

                  <div class="packs-grid">
                    <section class="play-panel">
                      <div class="panel-heading">
                        <div>
                          <p class="eyebrow">Fresh from the pack</p>
                          <h2>Recent pulls.</h2>
                        </div>
                        <button class="text-link" onClick={() => setTab("album")}>
                          See album <Icon name="arrow-right" size={14} />
                        </button>
                      </div>
                      <Show
                        when={game().cards.length > 0}
                        fallback={
                          <div class="empty-panel">
                            <CardBack size="sm" />
                            <div>
                              <h3>No pages yet.</h3>
                              <p>Your first pack is the beginning of the album.</p>
                              <button class="btn btn-primary" onClick={handleOpenPack} disabled={busy()}>
                                Open my first pack
                              </button>
                            </div>
                          </div>
                        }
                      >
                        <div class="recent-pulls">
                          <For each={game().cards.slice(0, 5)}>
                            {(card) => <GameCard card={card} size="sm" onClick={setSelectedCard} />}
                          </For>
                        </div>
                      </Show>
                    </section>

                    <aside class="play-side">
                      <section class="play-panel side-panel">
                        <div class="panel-heading">
                          <div>
                            <p class="eyebrow">Album health</p>
                            <h3>Rarity spread.</h3>
                          </div>
                          <Icon name="cards" size={18} />
                        </div>
                        <div class="rarity-spread">
                          <For each={Object.entries(RARITY_META)}>
                            {([rarity, meta]) => (
                              <div class="rarity-spread-row">
                                <span class={`rarity-dot rarity-dot--${rarity}`} />
                                <span>{meta.label}</span>
                                <div class="rarity-spread-bar">
                                  <span
                                    style={{ width: `${Math.min(100, (rarityCounts()[rarity] ?? 0) * 16)}%` }}
                                  />
                                </div>
                                <strong>{rarityCounts()[rarity] ?? 0}</strong>
                              </div>
                            )}
                          </For>
                        </div>
                        <div class="collection-score">
                          <span class="mono">COLLECTION SCORE</span>
                          <strong>{collectionScore().toLocaleString()}</strong>
                        </div>
                      </section>

                      <section class="play-panel side-panel score-panel">
                        <div class="panel-heading">
                          <div>
                            <p class="eyebrow">The Librarian</p>
                            <h3>Duel record.</h3>
                          </div>
                          <span class="duel-mini-avatar duel-mini-avatar--bot">L</span>
                        </div>
                        <div class="duel-record">
                          <div><span class="mono">WINS</span><strong>{game().profile.duelWins}</strong></div>
                          <div><span class="mono">LOSSES</span><strong>{game().profile.duelLosses}</strong></div>
                        </div>
                        <button class="btn btn-outline btn-full" onClick={() => setTab("duel")}>
                          <Icon name="duel" size={15} /> Challenge the Librarian
                        </button>
                      </section>
                    </aside>
                  </div>
                </Show>

                <Show when={tab() === "album"}>
                  <section class="play-section-head">
                    <div>
                      <p class="eyebrow">The album</p>
                      <h1>{game().stats.owned} pages, one of each.</h1>
                    </div>
                    <div class="album-summary">
                      <span><Icon name="bolt" size={14} /> {game().stats.minted} on-chain</span>
                      <span><Icon name="swap" size={14} /> {game().stats.tradeable} trading</span>
                    </div>
                  </section>

                  <div class="album-toolbar">
                    <label class="search-field">
                      <Icon name="search" size={16} />
                      <input
                        value={albumSearch()}
                        onInput={(event) => setAlbumSearch(event.currentTarget.value)}
                        placeholder="Search titles, categories, descriptions…"
                      />
                    </label>
                    <div class="filter-chips">
                      <For each={["all", "unminted", "minted", "trade"] as AlbumFilter[]}>
                        {(filter) => (
                          <button
                            class="filter-chip"
                            classList={{ "is-active": albumFilter() === filter }}
                            onClick={() => setAlbumFilter(filter)}
                          >
                            {filter === "all"
                              ? "All"
                              : filter === "unminted"
                                ? "Unminted"
                                : filter === "minted"
                                  ? "Minted"
                                  : "For trade"}
                          </button>
                        )}
                      </For>
                    </div>
                    <select
                      class="select-field"
                      value={rarityFilter()}
                      onChange={(event) => setRarityFilter(event.currentTarget.value as "all" | Rarity)}
                    >
                      <option value="all">All rarities</option>
                      <For each={Object.entries(RARITY_META)}>
                        {([rarity, meta]) => <option value={rarity}>{meta.label}</option>}
                      </For>
                    </select>
                  </div>

                  <Show
                    when={filteredCards().length > 0}
                    fallback={
                      <div class="album-empty">
                        <Icon name="cards" size={36} />
                        <h2>No matching cards.</h2>
                        <p>Open a pack or loosen the filters.</p>
                        <button class="btn btn-primary" onClick={() => setTab("packs")}>
                          Open a pack
                        </button>
                      </div>
                    }
                  >
                    <div class="album-grid">
                      <For each={filteredCards()}>
                        {(card) => <GameCard card={card} size="md" onClick={setSelectedCard} />}
                      </For>
                    </div>
                  </Show>
                </Show>

                <Show when={tab() === "exchange"}>
                  <section class="play-section-head">
                    <div>
                      <p class="eyebrow">The exchange</p>
                      <h1>Trade the page, not a JPEG.</h1>
                    </div>
                    <button class="btn btn-outline" onClick={() => loadGame()} disabled={refreshing()}>
                      <Icon name="refresh" size={15} /> {refreshing() ? "Refreshing…" : "Refresh board"}
                    </button>
                  </section>

                  <div class="exchange-grid">
                    <section class="play-panel exchange-market">
                      <div class="panel-heading">
                        <div>
                          <p class="eyebrow">Open to offers</p>
                          <h2>The market.</h2>
                        </div>
                        <span class="mono">{market().length} CARDS</span>
                      </div>
                      <Show
                        when={market().length > 0}
                        fallback={
                          <div class="empty-panel empty-panel--small">
                            <Icon name="swap" size={24} />
                            <div>
                              <h3>No cards on the block.</h3>
                              <p>List one of your unminted cards from its detail view.</p>
                            </div>
                          </div>
                        }
                      >
                        <div class="market-grid">
                          <For each={market()}>
                            {(card) => (
                              <div class="market-card">
                                <GameCard card={card} size="sm" onClick={setSelectedCard} />
                                <div class="market-card-foot">
                                  <span class="mono">{card.ownerName ?? "Collector"}</span>
                                  <button
                                    class="btn btn-small btn-primary"
                                    onClick={() => setOfferTarget(card)}
                                    disabled={!game().cards.some((owned) => owned.status === "claimed")}
                                  >
                                    <Icon name="swap" size={13} /> Propose
                                  </button>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </section>

                    <aside class="play-side">
                      <section class="play-panel side-panel">
                        <div class="panel-heading">
                          <div>
                            <p class="eyebrow">Incoming</p>
                            <h3>Offers for you.</h3>
                          </div>
                          <span class="mono">{trades().incoming.filter((trade) => trade.status === "proposed").length}</span>
                        </div>
                        <Show
                          when={trades().incoming.length > 0}
                          fallback={<p class="side-copy">No incoming offers yet. List a card to get the phone ringing.</p>}
                        >
                          <For each={trades().incoming}>
                            {(trade) => (
                              <div class="trade-offer">
                                <div class="trade-offer-cards">
                                  <GameCard card={trade.offeredCard} size="xs" />
                                  <span class="trade-arrow"><Icon name="swap" size={15} /></span>
                                  <GameCard card={trade.requestedCard} size="xs" />
                                </div>
                                <div class="trade-offer-info">
                                  <p>
                                    <strong>{trade.proposerName}</strong> offers{" "}
                                    <strong>{trade.offeredCard.title}</strong> for your{" "}
                                    <strong>{trade.requestedCard.title}</strong>.
                                  </p>
                                  <Show
                                    when={trade.status === "proposed"}
                                    fallback={<span class="trade-status">{trade.status}</span>}
                                  >
                                    <div class="trade-offer-actions">
                                      <button
                                        class="btn btn-small btn-primary"
                                        onClick={() => handleSettleTrade(trade, "accept")}
                                        disabled={busy()}
                                      >
                                        Accept
                                      </button>
                                      <button
                                        class="btn btn-small btn-ghost"
                                        onClick={() => handleSettleTrade(trade, "decline")}
                                        disabled={busy()}
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  </Show>
                                </div>
                              </div>
                            )}
                          </For>
                        </Show>
                      </section>

                      <section class="play-panel side-panel">
                        <div class="panel-heading">
                          <div>
                            <p class="eyebrow">Outgoing</p>
                            <h3>Your offers.</h3>
                          </div>
                          <span class="mono">{trades().outgoing.filter((trade) => trade.status === "proposed").length}</span>
                        </div>
                        <Show
                          when={trades().outgoing.length > 0}
                          fallback={<p class="side-copy">No open offers. Find a card on the market and propose a swap.</p>}
                        >
                          <For each={trades().outgoing}>
                            {(trade) => (
                              <div class="trade-offer trade-offer--outgoing">
                                <div class="trade-offer-cards">
                                  <GameCard card={trade.offeredCard} size="xs" />
                                  <span class="trade-arrow"><Icon name="swap" size={15} /></span>
                                  <GameCard card={trade.requestedCard} size="xs" />
                                </div>
                                <div class="trade-offer-info">
                                  <p>
                                    You offered <strong>{trade.offeredCard.title}</strong> for{" "}
                                    <strong>{trade.requestedCard.title}</strong>.
                                  </p>
                                  <Show
                                    when={trade.status === "proposed"}
                                    fallback={<span class="trade-status">{trade.status}</span>}
                                  >
                                    <button
                                      class="btn btn-small btn-ghost"
                                      onClick={() => handleSettleTrade(trade, "cancel")}
                                      disabled={busy()}
                                    >
                                      Cancel
                                    </button>
                                  </Show>
                                </div>
                              </div>
                            )}
                          </For>
                        </Show>
                      </section>
                    </aside>
                  </div>
                </Show>

                <Show when={tab() === "duel"}>
                  <section class="play-section-head">
                    <div>
                      <p class="eyebrow">The reading room</p>
                      <h1>Duel The Librarian.</h1>
                    </div>
                    <span class="duel-record-chip">
                      <Icon name="trophy" size={15} /> {game().profile.duelWins}W · {game().profile.duelLosses}L
                    </span>
                  </section>
                  <DuelGame cards={[...duelPool()]} onFinished={finishDuel} />
                </Show>

                <Show when={tab() === "ranking"}>
                  <section class="play-section-head">
                    <div>
                      <p class="eyebrow">The ranking</p>
                      <h1>Collectors of the week.</h1>
                    </div>
                    <span class="rank-chip">YOUR RANK #{game().stats.rank}</span>
                  </section>
                  <div class="ranking-layout">
                    <section class="play-panel ranking-panel">
                      <div class="ranking-head">
                        <span class="mono">#</span>
                        <span class="mono">COLLECTOR</span>
                        <span class="mono">CARDS</span>
                        <span class="mono">MINTED</span>
                        <span class="mono">DUELS</span>
                      </div>
                      <Show
                        when={leaderboard().length > 0}
                        fallback={<p class="side-copy">The ranking is empty. Open the first pack.</p>}
                      >
                        <For each={leaderboard()}>
                          {(entry) => (
                            <div class="ranking-row" classList={{ "is-you": entry.name === game().user.name }}>
                              <span class="ranking-place">{String(entry.rank).padStart(2, "0")}</span>
                              <span class="ranking-name">{entry.name}</span>
                              <strong>{entry.cards}</strong>
                              <span>{entry.minted}</span>
                              <span>{entry.duelWins}W</span>
                            </div>
                          )}
                        </For>
                      </Show>
                    </section>
                    <aside class="play-side">
                      <section class="play-panel side-panel rank-side">
                        <Icon name="trophy" size={26} />
                        <p class="eyebrow">Your collector card</p>
                        <h3>{game().user.name}</h3>
                        <p class="mono">{game().profile.walletAddress ? shortAddress(game().profile.walletAddress!) : "NO WALLET LINKED"}</p>
                        <div class="rank-side-stats">
                          <div><span>Owned</span><strong>{game().stats.owned}</strong></div>
                          <div><span>Minted</span><strong>{game().stats.minted}</strong></div>
                          <div><span>Rank</span><strong>#{game().stats.rank}</strong></div>
                        </div>
                        <Show when={game().profile.walletAddress}>
                          <a
                            class="text-link"
                            href={explorerAddressUrl(game().profile.walletAddress!, "devnet")}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View wallet <Icon name="external" size={12} />
                          </a>
                        </Show>
                      </section>
                    </aside>
                  </div>
                </Show>
              </main>
            )}
          </Show>
        </Show>
      </Show>

      <nav class="play-bottom-nav" aria-label="Game sections">
        <For each={tabs}>
          {(item) => (
            <button
              class="play-bottom-tab"
              classList={{ "is-active": tab() === item.id }}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </button>
          )}
        </For>
      </nav>

      <Show when={packCards()}>
        {(cards) => (
          <PackOpening
            cards={cards()}
            onClose={() => setPackCards(null)}
            onComplete={() => {
              setPackCards(null);
              showToast("Five pages added", { body: "They are waiting in your album.", tone: "success" });
            }}
          />
        )}
      </Show>

      <Show when={selectedCard()}>
        {(card) => (
          <CardModal
            card={card()}
            owned={Boolean(state()?.cards.some((owned) => owned.id === card().id))}
            linkedWallet={linkedWallet()}
            onClose={() => setSelectedCard(null)}
            onChanged={updateCard}
            onOpenWallet={openWalletModal}
            onProposeTrade={(target) => {
              setSelectedCard(null);
              setOfferTarget(target);
            }}
          />
        )}
      </Show>

      <Show when={offerTarget()}>
        {(target) => (
          <TradeOfferModal
            target={target()}
            cards={[...(state()?.cards ?? [])]}
            onClose={() => setOfferTarget(null)}
            onSubmitted={() => {
              setOfferTarget(null);
              void loadGame();
            }}
          />
        )}
      </Show>
    </div>
  );
}
