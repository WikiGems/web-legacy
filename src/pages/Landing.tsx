import { A, useNavigate } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { fetchWatchlist, fetchWiki, runApi, toggleWatchlist } from "../lib/api";
import { changeClass, formatChange, todayLabel } from "../lib/format";
import { openAuth, showToast } from "../lib/ui";
import { EntryCard, EntryRow } from "../components/EntryCard";
import { Footer } from "../components/Footer";
import { Icon } from "../components/Icon";
import { Nav } from "../components/Nav";
import { Sparkline } from "../components/Sparkline";
import { TickerTape } from "../components/TickerTape";
import type { WikiEntry } from "../../shared/domain";

export default function Landing() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const [wiki] = createResource(() => runApi(fetchWiki()));
  const [savedIds, setSavedIds] = createSignal<string[]>([]);

  createResource(
    () => (session().data?.user ? session().data!.user.id : undefined),
    async () => {
      const data = await runApi(fetchWatchlist());
      setSavedIds([...data.entryIds]);
      return data.entryIds;
    },
  );

  const entries = () => wiki()?.entries ?? [];
  const pulse = () => wiki()?.pulse;

  async function toggleSave(entry: WikiEntry) {
    if (!session().data) {
      openAuth("signin");
      return;
    }
    try {
      const result = await runApi(toggleWatchlist(entry.id));
      setSavedIds((current) =>
        result.watching ? [...new Set([...current, entry.id])] : current.filter((id) => id !== entry.id),
      );
      showToast(result.watching ? "Saved to your desk" : "Removed from your desk", {
        body: result.watching ? `${entry.ticker} · ${entry.title}` : undefined,
        tone: "success",
      });
    } catch (error) {
      showToast("Could not update your desk", {
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    }
  }

  function openDesk() {
    if (session().data) navigate("/desk");
    else openAuth("signup");
  }

  return (
    <div class="page page--landing">
      <Nav />
      <main>
        <section class="hero shell">
          <div class="hero-copy">
            <div class="hero-kicker">
              <span class="rule" />
              <span class="eyebrow">The open research desk · {todayLabel()}</span>
            </div>
            <h1>
              Markets reward
              <br />
              the <em>well-read.</em>
            </h1>
            <p class="hero-lede">
              WikiTrade is a collaborative research wiki and paper-trading desk. Write the thesis,
              show your work, and let the record — not the loudest voice — build conviction.
            </p>
            <div class="hero-actions">
              <button class="btn btn-ink btn-lg" onClick={openDesk}>
                <Icon name="fingerprint" size={18} />
                {session().data ? "Open your desk" : "Open your desk with a passkey"}
              </button>
              <a class="btn btn-outline btn-lg" href="#wiki">
                Browse the wiki <Icon name="arrow-right" size={17} />
              </a>
            </div>
            <div class="hero-proof">
              <div class="author-stack" aria-hidden="true">
                <span class="avatar avatar--stack">MC</span>
                <span class="avatar avatar--stack">JB</span>
                <span class="avatar avatar--stack">PN</span>
                <span class="avatar avatar--stack">LO</span>
              </div>
              <p>
                <strong>{pulse()?.stats.contributors ?? "8,431"}</strong> researchers.{" "}
                <strong>{pulse()?.stats.theses ?? "1,204"}</strong> theses on the record.
              </p>
            </div>
          </div>

          <div class="hero-visual">
            <div class="hero-note">
              <div class="note-top">
                <span class="mono">WIKITRADE / NOTE 042</span>
                <span class="live-badge">
                  <span class="live-dot" /> Updating
                </span>
              </div>
              <p class="note-label">Today’s consensus</p>
              <h2>“The AI trade is crowded.”</h2>
              <p class="note-body">
                Crowded is not the same as finished. The wiki is tracking where the marginal dollar
                is actually going — and where the narrative has stopped paying.
              </p>

              <div class="note-chart">
                <div class="note-chart-head">
                  <span>
                    <span class="mono">WIKI / CONVICTION</span>
                    <strong>AI &amp; compute</strong>
                  </span>
                  <span class="note-conviction">82<small>/100</small></span>
                </div>
                <Sparkline
                  values={[34, 38, 36, 44, 41, 48, 52, 49, 58, 61, 59, 67, 64, 72, 76, 74, 81, 79, 86]}
                  height={84}
                  positive
                />
                <div class="note-chart-axis mono">
                  <span>JUL</span>
                  <span>AUG</span>
                  <span>SEP</span>
                  <span>OCT</span>
                </div>
              </div>

              <div class="note-foot">
                <div>
                  <span class="mono">CONTRIBUTORS</span>
                  <strong>38</strong>
                </div>
                <div>
                  <span class="mono">LAST EDIT</span>
                  <strong>14 min</strong>
                </div>
                <div>
                  <span class="mono">STATUS</span>
                  <strong class="accent">Long</strong>
                </div>
              </div>

              <span class="passkey-sticker">
                <Icon name="key" size={14} /> Passkey secured
              </span>
            </div>

            <div class="hero-float">
              <span class="hero-float-icon">
                <Icon name="spark" size={15} />
              </span>
              <p>
                <strong>+214</strong> desks saved this thesis today
              </p>
            </div>

            <div class="hero-caption mono">FIG. 01 — CONSENSUS, WITH RECEIPTS</div>
          </div>
        </section>

        <TickerTape tickers={pulse()?.tickers ?? []} />

        <section class="wiki-section shell" id="wiki">
          <div class="section-head">
            <div>
              <p class="eyebrow">Live from the wiki</p>
              <h2>Today’s working notes.</h2>
            </div>
            <p class="section-note">
              Every note is versioned, source-linked, and open to challenge. The conviction number is
              the community’s current read — not a promise.
            </p>
          </div>

          <Show
            when={!wiki.loading}
            fallback={
              <div class="entry-grid">
                <For each={[0, 1, 2]}>
                  {() => <div class="entry-card skeleton-card" aria-hidden="true" />}
                </For>
              </div>
            }
          >
            <div class="entry-grid">
              <For each={entries().slice(0, 3)}>
                {(entry) => (
                  <EntryCard
                    entry={entry}
                    saved={savedIds().includes(entry.id)}
                    onToggle={toggleSave}
                  />
                )}
              </For>
            </div>
          </Show>

          <div class="wiki-foot">
            <p class="mono">DISPLAYING 3 OF {entries().length || 5} OPEN NOTES · UPDATED CONTINUOUSLY</p>
            <button
              class="text-link strong"
              onClick={() => {
                if (session().data) navigate("/desk");
                else openAuth("signup");
              }}
            >
              Save notes to your desk <Icon name="arrow-up-right" size={15} />
            </button>
          </div>
        </section>

        <section class="manifesto" id="manifesto">
          <div class="shell manifesto-inner">
            <p class="manifesto-mark">“</p>
            <blockquote>
              The edge is not a secret. It is a <em>habit of attention</em> — shared early, tested
              in public, and allowed to be wrong.
            </blockquote>
            <div class="manifesto-credit">
              <span class="rule rule--light" />
              <p>The WikiTrade editorial code, Article I</p>
            </div>
          </div>
        </section>

        <section class="pulse-section shell" id="pulse">
          <div class="section-head">
            <div>
              <p class="eyebrow">Friday close</p>
              <h2>The board.</h2>
            </div>
            <p class="section-note">
              A snapshot of where research attention is concentrating. Conviction is the
              contributor-weighted read; price is illustrative.
            </p>
          </div>

          <div class="pulse-grid">
            <div class="board-card">
              <div class="board-head">
                <span class="mono">SECTOR / CONVICTION</span>
                <span class="mono">{pulse()?.asOf ?? "Loading tape…"}</span>
              </div>
              <Show when={pulse()}>
                {(current) => (
                  <div class="sector-list">
                    <For each={current().sectors}>
                      {(sector) => (
                        <div class="sector-row">
                          <div class="sector-name">
                            <span class="sector-dot" />
                            {sector.name}
                            <span class="sector-notes mono">{sector.notes} notes</span>
                          </div>
                          <div class="sector-meter">
                            <span style={{ width: `${sector.conviction}%` }} />
                          </div>
                          <div class="sector-value">
                            <strong>{sector.conviction}</strong>
                            <span class={changeClass(sector.change)}>{formatChange(sector.change)}</span>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </Show>
              <div class="board-foot">
                <span class="mono">BREADTH</span>
                <div class="breadth">
                  <div class="breadth-bar">
                    <span style={{ width: `${pulse()?.breadth ?? 0}%` }} />
                  </div>
                  <strong>{pulse()?.breadth ?? "—"}%</strong>
                </div>
              </div>
            </div>

            <div class="board-side">
              <div class="regime-card">
                <p class="eyebrow">Regime read</p>
                <h3>{pulse()?.regime ?? "Reading the tape…"}</h3>
                <p>
                  Leadership is narrower than the index suggests. The wiki is overweight compute and
                  grid infrastructure, underweight long duration.
                </p>
                <div class="regime-stats">
                  <div>
                    <span class="mono">HIT RATE</span>
                    <strong>{pulse()?.stats.hitRate ?? "—"}</strong>
                  </div>
                  <div>
                    <span class="mono">NET STANCE</span>
                    <strong class="accent">Long</strong>
                  </div>
                </div>
              </div>

              <div class="rank-card">
                <div class="board-head">
                  <span class="mono">MOST READ / 24H</span>
                  <span class="mono">CONV.</span>
                </div>
                <Show when={pulse()}>
                  <For each={entries().slice(0, 4)}>
                    {(entry, index) => <EntryRow entry={entry} rank={index() + 1} />}
                  </For>
                </Show>
              </div>
            </div>
          </div>
        </section>

        <section class="method-section shell" id="method">
          <div class="method-intro">
            <p class="eyebrow">How the desk works</p>
            <h2>
              A paper trail
              <br />
              for your <em>thinking.</em>
            </h2>
            <p>
              No anonymous calls. No screenshots of positions. A WikiTrade note is a claim with
              sources, an update history, and a stake you can follow over time.
            </p>
          </div>

          <div class="method-steps">
            <article class="method-step">
              <span class="method-number">01</span>
              <div>
                <h3>Write the note</h3>
                <p>
                  Start with a ticker, a stance, and the one sentence everyone else is missing.
                  Attach sources. Set your conviction.
                </p>
              </div>
              <Icon name="arrow-up-right" size={20} class="method-arrow" />
            </article>
            <article class="method-step">
              <span class="method-number">02</span>
              <div>
                <h3>Let the wiki pressure-test it</h3>
                <p>
                  Contributors fork, challenge, and add evidence. Every edit is versioned. The
                  conviction score moves with the argument, not the vibes.
                </p>
              </div>
              <Icon name="arrow-up-right" size={20} class="method-arrow" />
            </article>
            <article class="method-step">
              <span class="method-number">03</span>
              <div>
                <h3>Track the record</h3>
                <p>
                  Save notes to your desk and mark the trade. Over time, your wiki becomes a
                  personal dataset of what you saw, when, and why.
                </p>
              </div>
              <Icon name="arrow-up-right" size={20} class="method-arrow" />
            </article>
          </div>
        </section>

        <section class="join-section shell" id="join">
          <div class="join-card">
            <div class="join-copy">
              <p class="eyebrow">Your desk is waiting</p>
              <h2>
                Read widely.
                <br />
                Write <em>precisely.</em>
              </h2>
              <p>
                Join {pulse()?.stats.contributors ?? "8,431"} researchers building the open record.
                One passkey. No password. Nothing to remember.
              </p>
              <div class="join-actions">
                <button class="btn btn-acid btn-lg" onClick={() => openAuth(session().data ? "signin" : "signup")}>
                  <Icon name="fingerprint" size={18} />
                  {session().data ? "Enter your desk" : "Create your passkey"}
                </button>
                <A href="/desk" class="btn btn-ghost btn-lg">
                  Visit the desk <Icon name="arrow-right" size={17} />
                </A>
              </div>
            </div>
            <div class="join-aside">
              <div class="join-key">
                <Icon name="fingerprint" size={42} />
                <p class="mono">PASSKEY / WEBAUTHN</p>
              </div>
              <p>
                Secured with Better Auth and stored in Turso. Your biometrics never leave your
                device.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
