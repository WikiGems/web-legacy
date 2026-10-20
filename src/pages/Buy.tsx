import { For, Show } from "solid-js";
import { RARITY_META } from "../../shared/card-engine";
import { Icon } from "../components/Icon";
import { showcaseCards } from "../lib/preview";
import "./Sell.css";
import "./Buy.css";

const cards = showcaseCards();
const fixedListings = cards.slice(0, 3).map((card, index) => ({
  card,
  seller: ["OrbitArchive", "PageTurner", "CuriousAtlas"][index]!,
  price: ["0.25", "0.40", "0.65"][index]!,
}));
const auctions = cards.slice(3, 6).map((card, index) => ({
  card,
  seller: ["PaperPlanets", "MuseumOfPages", "QuietCollector"][index]!,
  bid: ["0.30", "0.55", "0.80"][index]!,
  bids: [3, 7, 12][index]!,
  remaining: ["2h 15m", "8h 40m", "1d 3h"][index]!,
}));

export default function Buy() {
  return (
    <main class="sell-page buy-page page-shell">
      <header class="sell-heading">
        <div>
          <p class="eyebrow">Other collectors · example marketplace</p>
          <h1>Find your next card.</h1>
          <p>Browse fixed-price listings and auctions from other collectors.</p>
        </div>
        <span class="sell-example-badge">Example listings only</span>
      </header>

      <aside class="sell-example-note">
        <Icon name="info" size={20} />
        <p>
          <strong>Everything here is an example.</strong> Cards, seller names,
          prices, bids, and auction times are fictional sample listings. Buy and
          bid buttons are inactive. Auction times are static examples.
        </p>
      </aside>

      <section class="buy-section" aria-labelledby="buy-fixed-title">
        <div class="sell-section-heading">
          <div>
            <p class="eyebrow">Buy at the asking price</p>
            <h2 id="buy-fixed-title">Fixed-price examples</h2>
          </div>
          <span class="sell-example-badge">
            {fixedListings.length} sample listings
          </span>
        </div>
        <div class="sell-listings buy-listings">
          <For each={fixedListings}>
            {({ card, seller, price }) => (
              <article class="sell-listing">
                <div
                  class="sell-card-art"
                  style={{
                    "--sell-card-color": RARITY_META[card.rarity].color,
                  }}
                >
                  <Show when={card.imageUrl}>
                    {(url) => <img src={url()} alt="" loading="lazy" />}
                  </Show>
                  <span class="sell-example-badge">Example · fixed price</span>
                  <span class="sell-card-category">{card.category}</span>
                </div>
                <div class="sell-card-body">
                  <div class="sell-card-meta">
                    <span>{RARITY_META[card.rarity].label}</span>
                    <span>Example card</span>
                  </div>
                  <h3>{card.title}</h3>
                  <p class="buy-seller">
                    Example seller <strong>@{seller}</strong>
                  </p>
                  <p class="sell-description">{card.description}</p>
                  <div class="sell-price">
                    <span>Example asking price</span>
                    <strong>
                      {price} <small>SOL</small>
                    </strong>
                  </div>
                  <button
                    class="btn btn-primary buy-button"
                    type="button"
                    aria-label={`Buy example card: ${card.title}`}
                  >
                    Buy now
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
      </section>

      <section class="buy-section" aria-labelledby="buy-auctions-title">
        <div class="sell-section-heading">
          <div>
            <p class="eyebrow">Place a bid</p>
            <h2 id="buy-auctions-title">Auction examples</h2>
          </div>
          <span class="sell-example-badge">
            {auctions.length} sample auctions
          </span>
        </div>
        <div class="sell-listings buy-listings">
          <For each={auctions}>
            {({ card, seller, bid, bids, remaining }) => (
              <article class="sell-listing">
                <div
                  class="sell-card-art"
                  style={{
                    "--sell-card-color": RARITY_META[card.rarity].color,
                  }}
                >
                  <Show when={card.imageUrl}>
                    {(url) => <img src={url()} alt="" loading="lazy" />}
                  </Show>
                  <span class="sell-example-badge">Example · auction</span>
                  <span class="sell-card-category">{card.category}</span>
                </div>
                <div class="sell-card-body">
                  <div class="sell-card-meta">
                    <span>{RARITY_META[card.rarity].label}</span>
                    <span>Example card</span>
                  </div>
                  <h3>{card.title}</h3>
                  <p class="buy-seller">
                    Example seller <strong>@{seller}</strong>
                  </p>
                  <p class="sell-description">{card.description}</p>
                  <div class="sell-price">
                    <span>Example current bid</span>
                    <strong>
                      {bid} <small>SOL</small>
                    </strong>
                  </div>
                  <div class="buy-auction-details">
                    <span>{bids} example bids</span>
                    <span>
                      {remaining} left <small>(example)</small>
                    </span>
                  </div>
                  <button
                    class="btn btn-outline buy-button"
                    type="button"
                    aria-label={`Bid on example card: ${card.title}`}
                  >
                    Place a bid
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
      </section>
    </main>
  );
}
