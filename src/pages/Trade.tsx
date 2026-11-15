import { Card, Chip, Separator } from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
import { showcaseCards } from "../lib/preview";

const listings = showcaseCards()
  .slice(0, 4)
  .map((card, index) => ({
    card,
    price: [0.42, 0.88, 0.31, 1.24][index] ?? 0.42,
    owner:
      ["orbiting", "tideline", "marginalia", "helixclub"][index] ?? "collector",
  }));
const offers = [
  {
    person: "MapleArchive",
    direction: "Incoming",
    offered: "Library of Alexandria",
    wanted: "Moon",
    time: "12 min ago",
  },
  {
    person: "atlas.collects",
    direction: "Outgoing",
    offered: "Great Barrier Reef",
    wanted: "Machu Picchu",
    time: "Yesterday",
  },
];
export default function Trade() {
  return (
    <Page>
      <PageHeader
        eyebrow="The exchange"
        title="Trade a little knowledge."
        description="A fresh perspective is a fair exchange. Find something you love and pass a story along."
        action={<PreviewChip />}
      />
      <PreviewNotice>
        Explore a sample exchange. Listings and offers are fictional; no cards
        or funds change hands here.
      </PreviewNotice>
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Open to a good trade</h2>
          <Chip size="sm" variant="soft">
            <Chip.Label>4 sample listings</Chip.Label>
          </Chip>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard
              feedback="swap"
              key={listing.card.id}
              {...listing}
              action="Propose a trade"
            />
          ))}
        </div>
      </section>
      <section className="space-y-5">
        <h2 className="text-xl font-semibold">At the exchange table</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {offers.map((offer) => (
            <Card key={offer.person}>
              <Card.Header className="flex-row items-center gap-3">
                <Avatar name={offer.person} />
                <div className="min-w-0 flex-1">
                  <Card.Title className="truncate text-sm">
                    {offer.person}
                  </Card.Title>
                  <p className="text-xs text-muted">{offer.time}</p>
                </div>
                <Chip
                  size="sm"
                  color={offer.direction === "Incoming" ? "accent" : "default"}
                  variant="soft"
                >
                  <Chip.Label>{offer.direction}</Chip.Label>
                </Chip>
              </Card.Header>
              <Card.Content className="space-y-4">
                <Separator />
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs text-muted">Offered</p>
                    <p className="font-medium">{offer.offered}</p>
                  </div>
                  <Icon name="swap" className="text-muted" />
                  <div className="min-w-0 text-right">
                    <p className="mb-1 text-xs text-muted">Requested</p>
                    <p className="font-medium">{offer.wanted}</p>
                  </div>
                </div>
              </Card.Content>
              <Card.Footer className="gap-2">
                <Button isDisabled variant="secondary" size="sm">
                  Review offer
                </Button>
                <span className="text-xs text-muted">Sample offer</span>
              </Card.Footer>
            </Card>
          ))}
        </div>
      </section>
    </Page>
  );
}
