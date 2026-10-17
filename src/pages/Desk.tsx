import { A, useNavigate } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import type { WikiEntry } from "../../shared/domain";
import { authClient } from "../lib/auth-client";
import { fetchWatchlist, fetchWiki, runApi, toggleWatchlist } from "../lib/api";
import { changeClass, firstName, formatChange, initials, todayLabel } from "../lib/format";
import { openAuth, showToast } from "../lib/ui";
import { EntryCard } from "../components/EntryCard";
import { Footer } from "../components/Footer";
import { Icon } from "../components/Icon";
import { Nav } from "../components/Nav";
import { Sparkline } from "../components/Sparkline";

export default function Desk() {
  const session = authClient.useSession();
  const passkeys = authClient.useListPasskeys();
  const navigate = useNavigate();
  const [wiki] = createResource(() => runApi(fetchWiki()));
  const [watchlist, { mutate }] = createResource(
    () => session().data?.user.id,
    async () => (await runApi(fetchWatchlist())).entryIds,
  );

  const user = () => session().data?.user;
  const entries = () => wiki()?.entries ?? [];
  const savedIds = () => watchlist() ?? [];
  const savedEntries = createMemo(() => entries().filter((entry) => savedIds().includes(entry.id)));
  const recommendations = createMemo(() =>
    entries()
      .filter((entry) => !savedIds().includes(entry.id))
      .slice(0, 2),
  );

  const averageConviction = createMemo(() => {
    const list = savedEntries();
    if (!list.length) return 0;
    return Math.round(list.reduce((total, entry) => total + entry.conviction, 0) / list.length);
  });
  const sectorCount = createMemo(() => new Set(savedEntries().map((entry) => entry.sector)).size);
  const passkeyList = () => passkeys().data ?? [];

  async function removeEntry(entry: WikiEntry) {
    try {
      const result = await runApi(toggleWatchlist(entry.id));
      mutate((current) => (current ?? []).filter((id) => id !== entry.id));
      showToast(result.watching ? "Saved" : "Removed from your desk", {
        body: entry.ticker,
        tone: "success",
      });
    } catch (error) {
      showToast("Could not update your desk", {
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    }
  }

  function exportDesk() {
    const list = savedEntries();
    if (!list.length) {
      showToast("Your desk is empty", {
        body: "Save at least one research note before exporting.",
        tone: "info",
      });
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      owner: user()?.email,
      notes: list.map((entry) => ({
        ticker: entry.ticker,
        title: entry.title,
        sector: entry.sector,
        stance: entry.stance,
        conviction: entry.conviction,
        contributors: entry.contributors,
        author: entry.author.name,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wikitrade-desk-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Desk exported", { body: `${list.length} note${list.length === 1 ? "" : "s"} as JSON.`, tone: "success" });
  }

  async function addPasskey() {
    try {
      const result = await authClient.passkey.addPasskey({ name: "Additional WikiTrade passkey" });
      if (result.error) throw new Error(result.error.message || "Could not add passkey.");
      passkeys().refetch();
      showToast("Passkey added", { body: "This device can now open your desk.", tone: "success" });
    } catch (error) {
      showToast("Passkey not added", {
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    }
  }

  async function signOut() {
    await authClient.signOut();
    showToast("Signed out", { tone: "info" });
    navigate("/");
  }

  return (
    <div class="page page--desk">
      <Nav />
      <main class="desk shell">
        <Show
          when={!session().isPending}
          fallback={
            <div class="desk-loading">
              <span class="spinner spinner--ink" />
              <p class="mono">OPENING YOUR DESK…</p>
            </div>
          }
        >
          <Show
            when={user()}
            fallback={
              <section class="desk-gate">
                <div class="desk-gate-mark">
                  <Icon name="fingerprint" size={40} />
                </div>
                <p class="eyebrow">Private desk</p>
                <h1>Your notes are behind a passkey.</h1>
                <p>
                  Sign in with the passkey on this device, or open a new desk in under a minute. No
                  password, no email link.
                </p>
                <div class="desk-gate-actions">
                  <button class="btn btn-ink btn-lg" onClick={() => openAuth("signin")}>
                    <Icon name="key" size={18} /> Sign in with a passkey
                  </button>
                  <button class="btn btn-outline btn-lg" onClick={() => openAuth("signup")}>
                    Create a desk
                  </button>
                </div>
              </section>
            }
          >
            {(currentUser) => (
              <>
                <header class="desk-header">
                  <div>
                    <p class="eyebrow">Your desk · {todayLabel()}</p>
                    <h1>
                      Good afternoon, <em>{firstName(currentUser().name)}.</em>
                    </h1>
                  </div>
                  <div class="desk-header-actions">
                    <A class="btn btn-outline" href="/#wiki">
                      <Icon name="search" size={16} /> Find research
                    </A>
                    <button class="btn btn-ink" onClick={exportDesk}>
                      <Icon name="arrow-up-right" size={16} /> Export desk
                    </button>
                  </div>
                </header>

                <section class="stat-band" aria-label="Desk statistics">
                  <div class="stat-cell">
                    <span class="mono">SAVED NOTES</span>
                    <strong>{savedEntries().length.toString().padStart(2, "0")}</strong>
                    <p>on your desk</p>
                  </div>
                  <div class="stat-cell">
                    <span class="mono">AVG. CONVICTION</span>
                    <strong>{averageConviction() || "—"}</strong>
                    <p>{savedEntries().length ? "across saved notes" : "save a note to start"}</p>
                  </div>
                  <div class="stat-cell">
                    <span class="mono">SECTORS COVERED</span>
                    <strong>{sectorCount().toString().padStart(2, "0")}</strong>
                    <p>of five tracked</p>
                  </div>
                  <div class="stat-cell stat-cell--accent">
                    <span class="mono">PASSKEYS</span>
                    <strong>{passkeyList().length.toString().padStart(2, "0")}</strong>
                    <p>device credentials</p>
                  </div>
                </section>

                <div class="desk-grid">
                  <section class="desk-panel desk-panel--watchlist">
                    <div class="desk-panel-head">
                      <div>
                        <p class="eyebrow">The watchlist</p>
                        <h2>Notes you are tracking.</h2>
                      </div>
                      <span class="mono">{savedEntries().length} SAVED</span>
                    </div>

                    <Show
                      when={savedEntries().length > 0}
                      fallback={
                        <div class="empty-watchlist">
                          <span class="empty-mark">
                            <Icon name="bookmark" size={26} />
                          </span>
                          <h3>Your desk is clear.</h3>
                          <p>
                            Save a research note and it will appear here with its live conviction,
                            contributors, and stance.
                          </p>
                          <A href="/#wiki" class="btn btn-ink">
                            Browse today’s notes <Icon name="arrow-right" size={16} />
                          </A>
                        </div>
                      }
                    >
                      <div class="watchlist">
                        <For each={savedEntries()}>
                          {(entry) => (
                            <div class="watch-row">
                              <div class="watch-main">
                                <div class="watch-ticker">
                                  <strong>{entry.ticker}</strong>
                                  <span class={`stance stance--${entry.stance}`}>
                                    {entry.stance === "watch" ? "Watch" : entry.stance === "long" ? "Long" : "Short"}
                                  </span>
                                </div>
                                <div>
                                  <h3>{entry.title}</h3>
                                  <p>{entry.sector} · {entry.author.name}</p>
                                </div>
                              </div>
                              <div class="watch-spark">
                                <Sparkline
                                  values={entry.spark}
                                  positive={entry.change >= 0}
                                  height={40}
                                  width={120}
                                />
                              </div>
                              <div class="watch-conviction">
                                <span class="mono">CONV.</span>
                                <strong>{entry.conviction}</strong>
                              </div>
                              <div class="watch-change">
                                <span class={changeClass(entry.change)}>{formatChange(entry.change)}</span>
                                <span class="mono">{entry.updated}</span>
                              </div>
                              <button
                                class="icon-button watch-remove"
                                onClick={() => removeEntry(entry)}
                                aria-label={`Remove ${entry.title}`}
                                title="Remove from desk"
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>

                  <aside class="desk-side">
                    <section class="side-card side-card--read">
                      <div class="side-card-head">
                        <p class="eyebrow">The read</p>
                        <Icon name="spark" size={18} />
                      </div>
                      <h3>Attention is rotating. Your watchlist should know.</h3>
                      <p>
                        Grid infrastructure has added the most conviction this week. Duration is
                        losing the argument.
                      </p>
                      <div class="side-tags">
                        <span>Energy +9</span>
                        <span>Rates −6</span>
                      </div>
                    </section>

                    <section class="side-card">
                      <div class="side-card-head">
                        <p class="eyebrow">Secured by passkeys</p>
                        <Icon name="shield" size={17} />
                      </div>
                      <For each={passkeyList()}>
                        {(passkey) => (
                          <div class="passkey-row">
                            <span class="passkey-icon">
                              <Icon name="fingerprint" size={17} />
                            </span>
                            <div>
                              <strong>{passkey.name || "WikiTrade passkey"}</strong>
                              <p class="mono">
                                {passkey.deviceType?.replace("singleDevice", "single device") ??
                                  "device credential"}
                                {passkey.backedUp ? " · synced" : " · device only"}
                              </p>
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={passkeyList().length === 0}>
                        <p class="side-copy">No passkeys loaded yet.</p>
                      </Show>
                      <button class="btn btn-outline btn-full" onClick={addPasskey}>
                        <Icon name="plus" size={16} /> Add another passkey
                      </button>
                    </section>

                    <section class="side-card side-card--account">
                      <div class="account-row">
                        <span class="avatar">{initials(currentUser().name)}</span>
                        <div>
                          <strong>{currentUser().name}</strong>
                          <p>{currentUser().email}</p>
                        </div>
                      </div>
                      <button class="text-link" onClick={signOut}>
                        <Icon name="logout" size={15} /> Sign out
                      </button>
                    </section>
                  </aside>
                </div>

                <section class="recommend-section">
                  <div class="section-head section-head--compact">
                    <div>
                      <p class="eyebrow">Next on the desk</p>
                      <h2>Worth your attention.</h2>
                    </div>
                    <p class="section-note">Suggested from the open wiki, based on what you track.</p>
                  </div>
                  <Show
                    when={recommendations().length > 0}
                    fallback={<p class="side-copy">You have every open note saved. Go write one.</p>}
                  >
                    <div class="entry-grid entry-grid--two">
                      <For each={recommendations()}>
                        {(entry) => (
                          <EntryCard
                            entry={entry}
                            saved={false}
                            onToggle={(selected) => {
                              mutate((current) => [...new Set([...(current ?? []), selected.id])]);
                              runApi(toggleWatchlist(selected.id)).then(() =>
                                showToast("Saved to your desk", { body: selected.ticker, tone: "success" }),
                              ).catch(() =>
                                showToast("Could not save that note", { tone: "error" }),
                              );
                            }}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              </>
            )}
          </Show>
        </Show>
      </main>
      <Footer />
    </div>
  );
}
