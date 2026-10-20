import { For } from "solid-js";
import type { Rarity } from "../../shared/domain";
import { RARITY_META } from "../../shared/card-engine";
import { Icon } from "../components/Icon";
import { showcaseCards } from "../lib/preview";
import "./Collection.css";

const rarityOrder: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];
const previewCards = showcaseCards().slice(0, 8);
const topicCounts = Array.from(
  previewCards.reduce(
    (counts, card) =>
      counts.set(card.category, (counts.get(card.category) ?? 0) + 1),
    new Map<string, number>(),
  ),
  ([name, count]) => ({ name, count }),
);
const rarityCounts = rarityOrder
  .map((rarity) => ({
    rarity,
    count: previewCards.filter((card) => card.rarity === rarity).length,
  }))
  .filter(({ count }) => count > 0);
const rarePlusCount = previewCards.filter(
  (card) => rarityOrder.indexOf(card.rarity) >= rarityOrder.indexOf("rare"),
).length;

function compactCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export default function Collection() {
  return (
    <main class="collection-page page-shell">
      <header class="collection-intro">
        <div class="collection-intro-copy">
          <p class="eyebrow">
            YOUR ALBUM <span>/</span> SAMPLE 001
          </p>
          <h1>My collection</h1>
          <p class="collection-lede">
            A small index of remarkable pages, kept close.
          </p>
        </div>
        <div
          class="collection-preview-stamp"
          aria-label="Preview collection with sample data"
        >
          <span class="collection-preview-stamp-icon">
            <Icon name="cards" size={18} />
          </span>
          <span class="collection-preview-stamp-copy">
            <strong>Preview collection</strong>
            <span>DEMO DATA</span>
          </span>
        </div>
      </header>

      <aside class="collection-demo-note">
        <span class="collection-demo-note-icon">
          <Icon name="info" size={17} />
        </span>
        <p>
          <strong>Sample album.</strong> Cards, counts, and collection details
          on this page are preview content.
        </p>
      </aside>

      <section
        class="collection-summary"
        aria-label="Sample collection summary"
      >
        <article class="collection-summary-card collection-summary-card--primary">
          <span class="collection-summary-icon">
            <Icon name="cards" size={18} />
          </span>
          <div>
            <strong>{String(previewCards.length).padStart(2, "0")}</strong>
            <span>sample cards</span>
          </div>
          <span class="collection-summary-index">01</span>
        </article>
        <article class="collection-summary-card">
          <span class="collection-summary-icon">
            <Icon name="globe" size={18} />
          </span>
          <div>
            <strong>{String(topicCounts.length).padStart(2, "0")}</strong>
            <span>topics represented</span>
          </div>
          <span class="collection-summary-index">02</span>
        </article>
        <article class="collection-summary-card">
          <span class="collection-summary-icon">
            <Icon name="spark" size={18} />
          </span>
          <div>
            <strong>{String(rarePlusCount).padStart(2, "0")}</strong>
            <span>rare or higher</span>
          </div>
          <span class="collection-summary-index">03</span>
        </article>
      </section>

      <section
        class="collection-library"
        aria-labelledby="collection-library-title"
      >
        <div class="collection-library-heading">
          <div>
            <p class="eyebrow">THE ALBUM</p>
            <h2 id="collection-library-title">Collected articles</h2>
          </div>
          <span class="collection-result-count">
            <span class="collection-result-dot" />
            {previewCards.length} preview items
          </span>
        </div>

        <div class="collection-toolbar" aria-label="Preview collection filters">
          <div class="collection-filter-row">
            <span class="collection-filter-label">Topic</span>
            <div
              class="collection-filter-options"
              role="group"
              aria-label="Filter by topic"
            >
              <button
                class="collection-filter-chip is-selected"
                type="button"
                aria-pressed="true"
              >
                All topics <span>{previewCards.length}</span>
              </button>
              <For each={topicCounts}>
                {(topic) => (
                  <button
                    class="collection-filter-chip"
                    type="button"
                    aria-pressed="false"
                  >
                    {topic.name} <span>{topic.count}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="collection-filter-row">
            <span class="collection-filter-label">Rarity</span>
            <div
              class="collection-filter-options"
              role="group"
              aria-label="Filter by rarity"
            >
              <button
                class="collection-filter-chip is-selected"
                type="button"
                aria-pressed="true"
              >
                All rarities <span>{previewCards.length}</span>
              </button>
              <For each={rarityCounts}>
                {(item) => (
                  <button
                    class="collection-filter-chip collection-filter-chip--rarity"
                    type="button"
                    aria-pressed="false"
                    style={`--collection-rarity:${RARITY_META[item.rarity].color}`}
                  >
                    {RARITY_META[item.rarity].label} <span>{item.count}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="collection-grid">
          <For each={previewCards}>
            {(card, index) => (
              <article
                class={`collection-card collection-card--${card.rarity}`}
                style={`--collection-rarity:${RARITY_META[card.rarity].color};--collection-rarity-glow:${RARITY_META[card.rarity].glow}`}
              >
                <div class="collection-card-art">
                  <div class="collection-card-art-backdrop" />
                  {card.imageUrl && (
                    <img
                      class="collection-card-image"
                      src={card.imageUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div class="collection-card-art-shade" />
                  <div class="collection-card-art-top">
                    <span class="collection-wiki-mark" aria-hidden="true">
                      W
                    </span>
                    <span class="collection-one-of-one">
                      1 OF 1 <i>·</i> PREVIEW
                    </span>
                  </div>
                  <div class="collection-card-art-bottom">
                    <span>
                      ARTICLE <b>№ {String(index() + 1).padStart(2, "0")}</b>
                    </span>
                    <span>
                      <Icon name="globe" size={13} />{" "}
                      {compactCount(card.pageviews)} reads
                    </span>
                  </div>
                </div>
                <div class="collection-card-content">
                  <div class="collection-card-tags">
                    <span class="collection-category">{card.category}</span>
                    <span
                      class="collection-rarity"
                      style={`--collection-rarity:${RARITY_META[card.rarity].color}`}
                    >
                      <i />
                      {RARITY_META[card.rarity].label}
                    </span>
                  </div>
                  <h3>{card.title}</h3>
                  <p class="collection-card-description">{card.description}</p>
                  <div class="collection-card-footer">
                    <span>
                      Sample entry {String(index() + 1).padStart(2, "0")}
                    </span>
                    <button
                      class="collection-detail-button"
                      type="button"
                      aria-label={`View preview details for ${card.title}`}
                    >
                      View details <Icon name="arrow-up-right" size={14} />
                    </button>
                  </div>
                </div>
              </article>
            )}
          </For>
        </div>
      </section>
    </main>
  );
}
