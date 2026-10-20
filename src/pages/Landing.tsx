import { useNavigate } from "@solidjs/router";
import { For } from "solid-js";
import { authClient } from "../lib/auth-client";
import { showcaseCards } from "../lib/preview";
import { Footer } from "../components/Footer";
import { GameCard } from "../components/GameCard";
import { Icon } from "../components/Icon";
import { Nav } from "../components/Nav";

export default function Landing() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const cards = showcaseCards();
  const heroCards = cards.slice(0, 5);

  function start() {
    if (session().data?.user) navigate("/play");
    else navigate("/login?mode=signup");
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
              <h1>
                Every article
                <br />
                is a card.
                <br />
                <span>There is only one.</span>
              </h1>
              <p class="lm-lede">
                Open packs of real Wikipedia articles. Collect 1-of-1 cards,
                duel on what you know, and trade them as NFTs on Solana.
              </p>
              <div class="lm-hero-actions">
                <button class="btn btn-primary btn-xl" onClick={start}>
                  <Icon name="pack" size={18} /> Start collecting
                </button>
              </div>
              <div class="lm-hero-stats">
                <div>
                  <strong>6.8M+</strong>
                  <span>articles to collect</span>
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
              <div class="lm-float lm-float--one">
                <strong>1 of 1</strong>
                <span>no duplicates. ever.</span>
              </div>
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
              A collectible card game built from the largest encyclopedia ever
              written. The page you pull is the page you own.
            </p>
          </div>
          <div class="lm-feature-grid">
            <article class="lm-feature lm-feature--wide">
              <div class="lm-feature-icon">
                <Icon name="pack" size={24} />
              </div>
              <span class="mono">01 / Open</span>
              <h3>Five cards. Every ten minutes.</h3>
              <p>
                Every pack tears open five random Wikipedia articles. Familiar
                legends, obscure rabbit holes, and everything between. Rarity is
                decided by how often the world reads the page.
              </p>
              <div class="lm-mini-cards" aria-hidden="true">
                <For each={cards.slice(0, 3)}>
                  {(card) => <GameCard card={card} size="xs" />}
                </For>
              </div>
            </article>
            <article class="lm-feature">
              <div class="lm-feature-icon lm-feature-icon--violet">
                <Icon name="cards" size={24} />
              </div>
              <span class="mono">02 / Collect</span>
              <h3>One article. One card.</h3>
              <p>
                No duplicates. No reprints. Once an article is claimed, that
                card is gone from the archive forever.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
