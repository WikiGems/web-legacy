import { For } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { ListingCard } from "../components/ListingCard";
import { Page, PageHeader, PreviewChip, PreviewNotice } from "../components/Page";
import { buttonClass } from "../components/ui/button";
import { Chip } from "../components/ui/feedback";
import { previewAuctions } from "../lib/auction-preview";
import { showcaseCards } from "../lib/preview";

const cards = showcaseCards();
const listings = cards.slice(0, 3).map((card, index) => ({
  card,
  price: [0.25, 0.4, 0.65][index] ?? 0.25,
  owner: ["OrbitArchive", "PageTurner", "CuriousAtlas"][index] ?? "Collector",
}));

export default function Buy() {
  return (
    <Page>
      <PageHeader
        eyebrow="The marketplace"
        title="Find your next card."
        description="A new subject, a different perspective. Explore articles from other collectors."
        action={<PreviewChip />}
      />
      <PreviewNotice>
        Listings, sellers, prices, bids and times are sample data. Purchasing
        and bidding are not available yet. Open an auction to preview a bid.
      </PreviewNotice>
      <section class="space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Buy at a fixed price</h2>
          <Chip>3 sample listings</Chip>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <For each={listings}>
            {(listing) => (
              <ListingCard
                card={listing.card}
                price={listing.price}
                owner={listing.owner}
                actionPlacement="image"
              />
            )}
          </For>
        </div>
      </section>
      <section class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">On the auction block</h2>
          <Link to="/auctions/new" class={buttonClass("secondary")}>
            List a card for bidding
          </Link>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <For each={previewAuctions}>
            {(listing) => (
              <ListingCard
                card={listing.card}
                owner={listing.owner}
                price={listing.currentBid / 1_000_000}
                detail={`${listing.bidCount} bids · ${listing.timeRemaining} left`}
                auctionId={listing.id}
                action="Place a bid"
                actionPlacement="image"
              />
            )}
          </For>
        </div>
      </section>
    </Page>
  );
}
