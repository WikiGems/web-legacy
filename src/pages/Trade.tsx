import { For } from "solid-js";
import { Icon } from "../components/Icon";
import "./Trade.css";

const listings = [
  {
    title: "Moon",
    category: "Space",
    rarity: "Rare",
    rarityClass: "rare",
    price: "0.42",
    owner: "orbiting",
    art: "moon",
    mark: "LUNA / 01",
    description:
      "Earth’s only natural satellite, captured in a quiet lunar study.",
    symbol: "◒",
  },
  {
    title: "Great Barrier Reef",
    category: "Nature",
    rarity: "Epic",
    rarityClass: "epic",
    price: "0.88",
    owner: "tideline",
    art: "reef",
    mark: "CORAL / 02",
    description: "A living mosaic stretching along the coast of Queensland.",
    symbol: "✳",
  },
  {
    title: "Leonardo da Vinci",
    category: "Arts & culture",
    rarity: "Uncommon",
    rarityClass: "uncommon",
    price: "0.31",
    owner: "marginalia",
    art: "renaissance",
    mark: "STUDIO / 03",
    description: "Artist, inventor, and observer of the natural world.",
    symbol: "✦",
  },
  {
    title: "DNA",
    category: "Science",
    rarity: "Legendary",
    rarityClass: "legendary",
    price: "1.24",
    owner: "helixclub",
    art: "dna",
    mark: "GENESIS / 04",
    description: "The molecule that carries the instructions for life.",
    symbol: "⌁",
  },
] as const;

const offers = [
  {
    direction: "Incoming",
    directionClass: "incoming",
    person: "MapleArchive",
    initials: "MA",
    time: "12 min ago",
    offered: "Library of Alexandria",
    wanted: "Moon",
    amount: "+ 0.10 SOL",
    status: "Awaiting your review",
  },
  {
    direction: "Outgoing",
    directionClass: "outgoing",
    person: "atlas.collects",
    initials: "AC",
    time: "Yesterday",
    offered: "Great Barrier Reef",
    wanted: "Machu Picchu",
    amount: "Even trade",
    status: "Waiting on collector",
  },
] as const;

export default function Trade() {
  return (
    <main class="trade-page page-shell">
      <header class="trade-heading">
        <div class="trade-heading-copy">
          <div class="trade-kicker">
            <span class="eyebrow">Article exchange</span>
            <span class="trade-preview-label">
              <span aria-hidden="true" /> Sample preview
            </span>
          </div>
          <h1>
            Trade a little <em>knowledge.</em>
          </h1>
          <p>
            Find a new rabbit hole, or pass an article along to another
            collector.
          </p>
        </div>
        <div class="trade-heading-note">
          <span class="trade-note-mark" aria-hidden="true">
            <Icon name="swap" size={17} />
          </span>
          <div>
            <strong>One article. One card.</strong>
            <span>Every collectible is a 1 of 1.</span>
          </div>
        </div>
      </header>

      <div class="trade-workspace">
        <section class="trade-market" aria-labelledby="trade-market-title">
          <div class="trade-market-heading">
            <div>
              <span class="eyebrow">The exchange</span>
              <h2 id="trade-market-title">Available articles</h2>
            </div>
            <span class="trade-listing-count">
              <strong>04</strong> sample listings
            </span>
          </div>

          <div class="trade-toolbar" aria-label="Marketplace preview controls">
            <label class="trade-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                placeholder="Search articles or collectors"
                aria-label="Search articles or collectors"
              />
              <span class="trade-shortcut" aria-hidden="true">
                ⌘ K
              </span>
            </label>
            <div class="trade-filter-row">
              <div class="trade-filters" aria-label="Category filters">
                <button
                  class="trade-filter is-active"
                  type="button"
                  aria-pressed="true"
                >
                  All
                </button>
                <button class="trade-filter" type="button" aria-pressed="false">
                  Nature
                </button>
                <button class="trade-filter" type="button" aria-pressed="false">
                  Science
                </button>
                <button class="trade-filter" type="button" aria-pressed="false">
                  Culture
                </button>
              </div>
              <button
                class="trade-sort"
                type="button"
                aria-label="Sort sample listings"
              >
                <Icon name="filter" size={15} />
                <span>Recently listed</span>
                <Icon name="chevron-down" size={14} />
              </button>
            </div>
          </div>

          <div class="trade-listings">
            <For each={listings}>
              {(listing, index) => (
                <article class="trade-listing">
                  <div
                    class={`trade-art trade-art--${listing.art}`}
                    aria-hidden="true"
                  >
                    <div class="trade-art-topline">
                      <span>WIKIGEMS / FIELD NOTES</span>
                      <span>0{index() + 1}</span>
                    </div>
                    <div class="trade-art-illustration">
                      <span>{listing.symbol}</span>
                    </div>
                    <div class="trade-art-bottomline">
                      <span>{listing.mark}</span>
                      <span>1 OF 1</span>
                    </div>
                  </div>
                  <div class="trade-listing-content">
                    <div class="trade-listing-tags">
                      <span
                        class={`trade-rarity trade-rarity--${listing.rarityClass}`}
                      >
                        <i />
                        {listing.rarity}
                      </span>
                      <span class="trade-category">{listing.category}</span>
                    </div>
                    <h3>{listing.title}</h3>
                    <p class="trade-listing-description">
                      {listing.description}
                    </p>
                    <div class="trade-listing-owner">
                      <span class="trade-owner-dot" /> Listed by{" "}
                      <strong>{listing.owner}</strong>
                    </div>
                    <div class="trade-listing-footer">
                      <div class="trade-price">
                        <span>Asking price</span>
                        <strong>
                          {listing.price} <small>SOL</small>
                        </strong>
                      </div>
                      <button
                        class="btn btn-outline btn-small trade-offer-button"
                        type="button"
                      >
                        Make offer <Icon name="arrow-up-right" size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              )}
            </For>
          </div>
        </section>

        <aside class="trade-aside" aria-label="Offer activity preview">
          <section
            class="trade-activity-panel"
            aria-labelledby="trade-activity-title"
          >
            <div class="trade-aside-heading">
              <div>
                <span class="eyebrow">Your desk</span>
                <h2 id="trade-activity-title">Offer activity</h2>
              </div>
              <span class="trade-activity-count">02</span>
            </div>
            <div class="trade-offer-tabs" aria-label="Offer direction preview">
              <span class="is-selected">
                All offers <b>02</b>
              </span>
              <span>
                Incoming <b>01</b>
              </span>
              <span>
                Outgoing <b>01</b>
              </span>
            </div>
            <div class="trade-offer-list">
              <For each={offers}>
                {(offer) => (
                  <article class="trade-offer-preview">
                    <div class="trade-offer-heading">
                      <span
                        class={`trade-offer-direction trade-offer-direction--${offer.directionClass}`}
                      >
                        <i />
                        {offer.direction}
                      </span>
                      <span class="trade-offer-time">{offer.time}</span>
                    </div>
                    <div class="trade-offer-people">
                      <span
                        class={`trade-avatar trade-avatar--${offer.directionClass}`}
                      >
                        {offer.initials}
                      </span>
                      <strong>{offer.person}</strong>
                      <span>proposed a swap</span>
                    </div>
                    <div class="trade-offer-exchange">
                      <div class="trade-offer-item trade-offer-item--from">
                        <span>OFFERING</span>
                        <strong>{offer.offered}</strong>
                      </div>
                      <Icon name="swap" size={16} />
                      <div class="trade-offer-item trade-offer-item--for">
                        <span>FOR</span>
                        <strong>{offer.wanted}</strong>
                      </div>
                    </div>
                    <div class="trade-offer-bottom">
                      <strong>{offer.amount}</strong>
                      <span>{offer.status}</span>
                    </div>
                  </article>
                )}
              </For>
            </div>
            <p class="trade-preview-footnote">
              Offer states and details are sample preview content.
            </p>
          </section>

          <section class="trade-aside-note" aria-label="About article trading">
            <span class="trade-note-icon">
              <Icon name="spark" size={17} />
            </span>
            <div>
              <strong>Curiosity travels.</strong>
              <p>Trade a familiar favorite for a page you’ve never opened.</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
