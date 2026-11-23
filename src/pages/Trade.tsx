import { For } from "solid-js";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Chip, Separator } from "../components/ui/feedback";
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
      <section class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">Open to a good trade</h2>
          <Chip>4 sample listings</Chip>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <For each={listings}>
            {(listing) => (
              <ListingCard
                feedback="swap"
                card={listing.card}
                price={listing.price}
                owner={listing.owner}
                action="Propose a trade"
              />
            )}
          </For>
        </div>
      </section>
      <section class="space-y-5">
        <h2 class="text-xl font-semibold">At the exchange table</h2>
        <div class="grid gap-5 md:grid-cols-2">
          <For each={offers}>
            {(offer) => (
              <Card>
                <CardHeader class="flex-row items-center gap-3 pb-0">
                  <Avatar name={offer.person} />
                  <div class="min-w-0 flex-1">
                    <CardTitle class="truncate text-sm">
                      {offer.person}
                    </CardTitle>
                    <p class="text-xs text-muted">{offer.time}</p>
                  </div>
                  <Chip
                    tone={offer.direction === "Incoming" ? "accent" : "default"}
                  >
                    {offer.direction}
                  </Chip>
                </CardHeader>
                <CardContent class="space-y-4">
                  <Separator />
                  <div class="flex items-center justify-between gap-4 text-sm">
                    <div class="min-w-0">
                      <p class="mb-1 text-xs text-muted">Offered</p>
                      <p class="font-medium">{offer.offered}</p>
                    </div>
                    <Icon name="swap" class="text-muted" />
                    <div class="min-w-0 text-right">
                      <p class="mb-1 text-xs text-muted">Requested</p>
                      <p class="font-medium">{offer.wanted}</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button disabled variant="secondary" size="sm">
                    Review offer
                  </Button>
                  <span class="text-xs text-muted">Sample offer</span>
                </CardFooter>
              </Card>
            )}
          </For>
        </div>
      </section>
    </Page>
  );
}
