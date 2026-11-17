import { Chip } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { previewAuctions } from "../lib/auction-preview";
import { ListingCard } from "../components/ListingCard";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
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
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Buy at a fixed price</h2>
          <Chip size="sm" variant="soft">
            <Chip.Label>3 sample listings</Chip.Label>
          </Chip>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard
              key={listing.card.id}
              {...listing}
              actionPlacement="image"
            />
          ))}
        </div>
      </section>
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">On the auction block</h2>
          <Link to="/auctions/new" className="button button--secondary">
            List a card for bidding
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {previewAuctions.map((listing) => (
            <ListingCard
              key={listing.card.id}
              card={listing.card}
              owner={listing.owner}
              price={listing.currentBid / 1_000_000}
              detail={`${listing.bidCount} bids · ${listing.timeRemaining} left`}
              auctionId={listing.id}
              action="Place a bid"
              actionPlacement="image"
            />
          ))}
        </div>
      </section>
    </Page>
  );
}
