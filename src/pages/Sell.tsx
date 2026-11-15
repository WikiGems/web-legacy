import { MoneyAmount } from "../components/MoneyAmount";
import { HapticButton as Button } from "../components/HapticButton";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { Page, PageHeader, PreviewNotice, StatCard } from "../components/Page";
import { showcaseCards } from "../lib/preview";
import { Link } from "@tanstack/react-router";

const listings = showcaseCards()
  .slice(0, 4)
  .map((card, index) => ({
    card,
    price: [0.25, 0.4, 0.65, 0.3][index] ?? 0.25,
    detail: [
      "Listed 2 hours ago",
      "Listed yesterday",
      "Listed 2 days ago",
      "Listed 3 days ago",
    ][index],
  }));
export default function Sell() {
  return (
    <Page>
      <PageHeader
        eyebrow="Your storefront"
        title="Your cards for sale."
        description="Make room for your next discovery. Keep your listings together in one place."
        action={
          <div className="flex flex-wrap gap-3">
            <Link to="/auctions/new" className="button button--secondary">
              List a card for bidding
            </Link>
            <Button feedback="sell" isDisabled>
              <Icon name="plus" />
              List a card
            </Button>
          </div>
        }
      />
      <PreviewNotice>
        These are example listings, not your actual collection. Listing and
        price controls will become available when the marketplace launches.
      </PreviewNotice>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Example listings" value="4" icon="cards" />
        <StatCard
          label="Example asking total"
          value={
            <MoneyAmount
              amount={1.6}
              currency="USDC"
              unitClassName="text-sm font-normal text-muted"
            />
          }
          icon="coin"
        />
        <StatCard label="Example sales" value="0" icon="swap" />
      </div>
      <section className="space-y-5">
        <h2 className="text-xl font-semibold">Listed for sale</h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard
              feedback="sell"
              key={listing.card.id}
              {...listing}
              owner="you"
              action="Edit listing"
            />
          ))}
        </div>
      </section>
    </Page>
  );
}
