import { For, Show } from "solid-js";
import { RARITY_META } from "../../shared/card-engine";
import { Icon } from "../components/Icon";
import { showcaseCards } from "../lib/preview";
import "./Sell.css";

const listings = showcaseCards()
  .slice(0, 4)
  .map((card, index) => ({
    card,
    price: ["0.25", "0.40", "0.65", "0.30"][index]!,
    listed: ["2 hours ago", "Yesterday", "2 days ago", "3 days ago"][index]!,
  }));

export default function Sell() {
  return (
    <main class="sell-page page-shell">
      <header class="sell-heading">
        <div>
          <p class="eyebrow">Your storefront · example preview</p>
          <h1>Your cards for sale.</h1>
          <p>Keep track of the articles you’ve put on the market.</p>
        </div>
        <button class="btn btn-primary" type="button">
          <Icon name="plus" size={16} /> List a card
        </button>
      </header>

      <aside class="sell-example-note">
        <Icon name="info" size={20} />
        <p>
          <strong>Example listings only.</strong> These are sample cards, not
          your actual collection. All prices, listing times, and statuses are
          examples. Sale controls are previews.
        </p>
      </aside>

      <section class="sell-summary" aria-label="Example sales summary">
        <div>
          <span>Example listings</span>
          <strong>{listings.length.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Example asking total</span>
          <strong>
            {listings
              .reduce((sum, listing) => sum + Number(listing.price), 0)
              .toFixed(2)}{" "}
            <small>SOL</small>
          </strong>
        </div>
        <div>
          <span>Example sales</span>
          <strong>00</strong>
        </div>
      </section>

      <section aria-labelledby="sell-listings-title">
        <div class="sell-section-heading">
          <h2 id="sell-listings-title">Listed for sale</h2>
          <span class="sell-example-badge">
            {listings.length} example cards
          </span>
        </div>
        <div class="sell-listings">
          <For each={listings}>
            {({ card, price, listed }) => (
              <article class="sell-listing">
                <div
                  class="sell-card-art"
                  style={{
                    "--sell-card-color": RARITY_META[card.rarity].color,
                  }}
                >
                  <Show when={card.imageUrl}>
                    {(imageUrl) => (
                      <img src={imageUrl()} alt="" loading="lazy" />
                    )}
                  </Show>
                  <span class="sell-example-badge">Example card</span>
                  <span class="sell-card-category">{card.category}</span>
                </div>
                <div class="sell-card-body">
                  <div class="sell-card-meta">
                    <span>{RARITY_META[card.rarity].label}</span>
                    <span>Example · listed</span>
                  </div>
                  <h3>{card.title}</h3>
                  <p class="sell-description">{card.description}</p>
                  <div class="sell-price">
                    <span>Example asking price</span>
                    <strong>
                      {price} <small>SOL</small>
                    </strong>
                  </div>
                  <p class="sell-listed">Example listing · {listed}</p>
                  <div class="sell-card-actions">
                    <button
                      class="btn btn-outline"
                      type="button"
                      aria-label={`Edit example price for ${card.title}`}
                    >
                      Edit price
                    </button>
                    <button
                      class="btn btn-ghost"
                      type="button"
                      aria-label={`Remove example listing for ${card.title}`}
                    >
                      Remove listing
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
