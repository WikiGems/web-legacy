import { useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { openAuth } from "../lib/ui";
import { showcaseCards } from "../lib/preview";
import { RARITY_META, shortNumber } from "../../shared/card-engine";
import type { Rarity } from "../../shared/domain";
import { Footer } from "../components/Footer";
import { GameCard } from "../components/GameCard";
import { Icon } from "../components/Icon";
import { Nav } from "../components/Nav";

const rarityOrder: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export default function Landing() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const cards = showcaseCards();
  const heroCards = cards.slice(0, 5);
  const spotlight = cards[4] ?? cards[0]!;

  function start() {
    if (session().data?.user) navigate("/play");
    else openAuth("signup");
  }

  return (
    <div class="page page--landing">
      <Nav />
      <main>
        <section class="lm-hero">
          <div class="lm-hero-bg" aria-hidden="true">
            <div class="lm-orb lm-orb--green" />
            <div class="lm-orb lm-orb--violet" />
            <div class="lm-grid" />
          </div>
          <div class="page-shell lm-hero-inner">
            <div class="lm-hero-copy">
              <div class="lm-kicker">
                <span class="live-dot" />
                The Wikipedia card game
                <span class="lm-kicker-divider">/</span>
                1 article = 1 card
              </div>
              <h1>
                Every article
                <br />
                is a card.
                <br />
                <span>There is only one.</span>
              </h1>
              <p class="lm-lede">
                Open packs of real Wikipedia articles. Collect 1-of-1 cards, duel on what you know,
                and trade them as NFTs on Solana.
              </p>
              <div class="lm-hero-actions">
                <button class="btn btn-primary btn-xl" onClick={start}>
                  <Icon name="pack" size={18} /> Start collecting
                </button>
                <a class="btn btn-outline btn-xl" href="#how">
                  How it works <Icon name="arrow-right" size={16} />
                </a>
              </div>
              <div class="lm-hero-stats">
                <div>
                  <strong>6.8M+</strong>
                  <span>articles to collect</span>
                </div>
                <div>
                  <strong>5</strong>
                  <span>cards per pack</span>
                </div>
                <div>
                  <strong>1/1</strong>
                  <span>on-chain provenance</span>
                </div>
              </div>
            </div>

            <div class="lm-hero-stage" aria-label="Featured WikiGems cards">
              <div class="lm-card-fan">
                <For each={heroCards}>
                  {(card, index) => (
                    <div class={`lm-fan-card lm-fan-card--${index() + 1}`}>
                      <GameCard card={card} size="sm" />
                    </div>
                  )}
                </For>
              </div>
              <div class="lm-float lm-float--rarity">
                <span class="rarity-pip" /> Mythic pull
              </div>
              <div class="lm-float lm-float--chain">
                <Icon name="bolt" size={13} /> Minted on Solana
              </div>
              <div class="lm-float lm-float--one">
                <strong>1 of 1</strong>
                <span>no duplicates. ever.</span>
              </div>
              <p class="lm-stage-caption mono">THE ALBUM · LIVE PREVIEW</p>
            </div>
          </div>
        </section>

        <section class="lm-marquee" aria-label="Card previews">
          <div class="lm-marquee-track">
            <For each={[...cards, ...cards]}>
              {(card) => (
                <div class="lm-marquee-card">
                  <GameCard card={card} size="xs" />
                </div>
              )}
            </For>
          </div>
        </section>

        <section class="lm-section page-shell" id="how">
          <div class="lm-section-head">
            <p class="eyebrow">The loop</p>
            <h2>
              Open. Collect.
              <br />
              <em>Fight. Trade.</em>
            </h2>
            <p>
              A collectible card game built from the largest encyclopedia ever written. The page you
              pull is the page you own.
            </p>
          </div>
          <div class="lm-feature-grid">
            <article class="lm-feature lm-feature--wide">
              <div class="lm-feature-icon"><Icon name="pack" size={24} /></div>
              <span class="mono">01 / OPEN</span>
              <h3>Five cards. Every ten minutes.</h3>
              <p>
                Every pack tears open five random Wikipedia articles. Familiar legends, obscure
                rabbit holes, and everything between. Rarity is decided by how often the world reads
                the page.
              </p>
              <div class="lm-mini-cards" aria-hidden="true">
                <For each={cards.slice(0, 3)}>
                  {(card) => <GameCard card={card} size="xs" />}
                </For>
              </div>
            </article>
            <article class="lm-feature">
              <div class="lm-feature-icon lm-feature-icon--violet"><Icon name="cards" size={24} /></div>
              <span class="mono">02 / COLLECT</span>
              <h3>One article. One card.</h3>
              <p>
                No duplicates. No reprints. Once an article is claimed, that card is gone from the
                archive forever.
              </p>
            </article>
            <article class="lm-feature">
              <div class="lm-feature-icon lm-feature-icon--orange"><Icon name="duel" size={24} /></div>
              <span class="mono">03 / DUEL</span>
              <h3>Know the page. Win the round.</h3>
              <p>
                Face another collector in three questions drawn from your cards. The deeper your
                reading, the sharper your advantage.
              </p>
            </article>
            <article class="lm-feature lm-feature--trade">
              <div class="lm-feature-icon lm-feature-icon--blue"><Icon name="swap" size={24} /></div>
              <span class="mono">04 / TRADE</span>
              <h3>Turn a duplicate into a grail.</h3>
              <p>
                Put cards on the exchange, propose swaps, and build the album you actually want.
                Mint finished cards to Solana for permanent provenance.
              </p>
              <div class="trade-swap-visual" aria-hidden="true">
                <GameCard card={cards[1]!} size="xs" class="swap-left" />
                <span class="swap-symbol"><Icon name="swap" size={18} /></span>
                <GameCard card={cards[2]!} size="xs" class="swap-right" />
              </div>
            </article>
          </div>
        </section>

        <section class="lm-spotlight" id="rarity">
          <div class="page-shell lm-spotlight-grid">
            <div class="lm-spotlight-art">
              <div class="lm-spotlight-aura" />
              <GameCard card={spotlight} size="lg" />
              <span class="lm-spotlight-tag mono">CARD #{spotlight.articleId}</span>
            </div>
            <div class="lm-spotlight-copy">
              <p class="eyebrow">The 1-of-1 rule</p>
              <h2>
                The page is the
                <br />
                <em>provenance.</em>
              </h2>
              <p>
                A WikiGems card is not a picture of an article. It is a claim on the page itself.
                Rarity, attack, and defense are derived from real readership and the shape of the
                article.
              </p>
              <div class="lm-spotlight-meta">
                <div>
                  <span class="mono">YEARLY VIEWS</span>
                  <strong>{shortNumber(spotlight.pageviews)}</strong>
                </div>
                <div>
                  <span class="mono">ATTACK</span>
                  <strong>{spotlight.attack.toLocaleString()}</strong>
                </div>
                <div>
                  <span class="mono">DEFENSE</span>
                  <strong>{spotlight.defense.toLocaleString()}</strong>
                </div>
                <div>
                  <span class="mono">RARITY</span>
                  <strong>{RARITY_META[spotlight.rarity].label}</strong>
                </div>
              </div>
              <div class="lm-rarity-ladder">
                <For each={rarityOrder}>
                  {(rarity) => {
                    const meta = RARITY_META[rarity];
                    return (
                      <div class="lm-rarity-row">
                        <span class={`rarity-dot rarity-dot--${rarity}`} />
                        <span>{meta.label}</span>
                        <span class="mono">{meta.code}</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>
        </section>

        <section class="lm-duel-section page-shell">
          <div class="lm-duel-panel">
            <div class="lm-duel-copy">
              <p class="eyebrow">The duel</p>
              <h2>
                Your cards know
                <br />
                things. Do <em>you?</em>
              </h2>
              <p>
                Three questions. Two collectors. One winner. Every duel is generated from the pages
                in play, so reading your collection is genuinely an advantage.
              </p>
              <button class="btn btn-primary" onClick={start}>
                <Icon name="duel" size={17} /> Enter the duel
              </button>
            </div>
            <div class="lm-quiz">
              <div class="lm-quiz-head">
                <span class="lm-quiz-round mono">ROUND 2 / 3</span>
                <span class="lm-quiz-score">1,840 <span>—</span> 1,610</span>
              </div>
              <p class="lm-quiz-question">
                Which article is described as “a free online encyclopedia written and maintained by
                a community of volunteer editors”?
              </p>
              <div class="lm-quiz-options">
                <span>Encyclopædia Britannica</span>
                <span class="is-correct">Wikipedia <Icon name="check" size={14} /></span>
                <span>Wikimedia Commons</span>
                <span>Wiktionary</span>
              </div>
              <div class="lm-quiz-foot">
                <span>Your card: <strong>Wikipedia</strong></span>
                <span class="mono">+240 PTS</span>
              </div>
            </div>
          </div>
        </section>

        <section class="lm-trade-section page-shell" id="trade">
          <div class="lm-trade-copy">
            <p class="eyebrow">The exchange</p>
            <h2>
              Trade the page.
              <br />
              <em>Keep the story.</em>
            </h2>
            <p>
              Every card is unique, so every trade matters. Propose a swap, accept an offer, and
              watch the ownership move. Mint to Solana when you want the claim to leave the game and
              live in your wallet.
            </p>
            <div class="lm-trade-points">
              <div><Icon name="check" size={15} /> In-game swaps settle instantly</div>
              <div><Icon name="check" size={15} /> Minted cards become Metaplex Core NFTs</div>
              <div><Icon name="check" size={15} /> No duplicate supply, no dilution</div>
            </div>
          </div>
          <div class="lm-trade-board">
            <div class="lm-trade-board-head">
              <span class="mono">OPEN OFFERS</span>
              <span class="live-badge"><span class="live-dot" /> LIVE</span>
            </div>
            <div class="lm-trade-row">
              <GameCard card={cards[1]!} size="xs" />
              <span class="trade-arrow"><Icon name="swap" size={18} /></span>
              <GameCard card={cards[2]!} size="xs" />
              <div class="lm-trade-row-info">
                <strong>Moon</strong>
                <span>for</span>
                <strong>Bitcoin</strong>
                <small>Offered by @lunar_collector · 3m ago</small>
              </div>
            </div>
            <div class="lm-trade-row">
              <GameCard card={cards[3]!} size="xs" />
              <span class="trade-arrow"><Icon name="swap" size={18} /></span>
              <GameCard card={cards[5] ?? cards[4]!} size="xs" />
              <div class="lm-trade-row-info">
                <strong>Octopus</strong>
                <span>for</span>
                <strong>Dune (novel)</strong>
                <small>Offered by @deep_reader · 11m ago</small>
              </div>
            </div>
          </div>
        </section>

        <section class="lm-solana" id="solana">
          <div class="page-shell lm-solana-inner">
            <div class="lm-solana-copy">
              <p class="eyebrow">On Solana</p>
              <h2>
                Cards that leave
                <br />
                the <em>building.</em>
              </h2>
              <p>
                WikiGems cards are born in the game and can become real Metaplex Core assets on
                Solana. Connect Phantom, Solflare, or Backpack and mint a 1-of-1 collectible to your
                own wallet. Your keys, your pages.
              </p>
              <div class="lm-solana-pills">
                <span><Icon name="bolt" size={13} /> Metaplex Core</span>
                <span><Icon name="wallet" size={13} /> Phantom / Solflare</span>
                <span><Icon name="shield" size={13} /> Devnet</span>
              </div>
            </div>
            <div class="lm-solana-proof">
              <div class="lm-proof-row">
                <span class="lm-proof-index mono">01</span>
                <div>
                  <h3>Pull a card</h3>
                  <p>Five unique articles, one pack, every ten minutes.</p>
                </div>
              </div>
              <div class="lm-proof-row">
                <span class="lm-proof-index mono">02</span>
                <div>
                  <h3>Claim the 1-of-1</h3>
                  <p>The archive locks the page to your collector account.</p>
                </div>
              </div>
              <div class="lm-proof-row">
                <span class="lm-proof-index mono">03</span>
                <div>
                  <h3>Mint the page</h3>
                  <p>The article, stats, and edition are written into the NFT metadata.</p>
                </div>
              </div>
              <Show when={spotlight.mintAddress}>
                <div class="lm-proof-address mono">{spotlight.mintAddress}</div>
              </Show>
            </div>
          </div>
        </section>

        <section class="lm-cta page-shell">
          <div class="lm-cta-inner">
            <p class="eyebrow">Your first pack is waiting</p>
            <h2>
              The sum of human
              <br />
              knowledge. <em>Collect it.</em>
            </h2>
            <p>
              Create a passkey, open five cards, and see which page the archive gives you first.
            </p>
            <button class="btn btn-primary btn-xl" onClick={start}>
              <Icon name="bolt" size={18} /> Create your collector
            </button>
            <span class="lm-cta-note">No wallet needed to start · Passkey login · 1/1 cards</span>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
