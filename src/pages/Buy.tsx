import {
  createMemo,
  createSignal,
  Errored,
  For,
  Loading,
  refresh,
  Show,
} from "solid-js";
import { Link } from "@tanstack/solid-router";
import { Api } from "@wikigems/client";
import type { Listing } from "@wikigems/domain/domain";
import { Effect } from "effect";
import { ListingCard } from "../components/ListingCard";
import { Page, PageHeader, PreviewNotice } from "../components/Page";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { Button, buttonClass } from "../components/ui/button";
import { Alert } from "../components/ui/feedback";
import { previewAuctions } from "../lib/auction-preview";
import { createAsync } from "../runtime";

export default function Buy() {
  const [selection, setSelection] = createSignal<Listing | null>(null);
  const data = createAsync(() =>
    Api.use((api) =>
      Effect.all(
        { market: api.fetchMarket(), game: api.fetchGameState() },
        { concurrency: "unbounded" },
      ),
    ),
  );
  const listings = createMemo(() => {
    const { market, game } = data();
    const owned = new Set(game.cards.map((card) => card.id));
    return market.listings.filter((listing) => !owned.has(listing.card.id));
  });

  return (
    <Page>
      <PageHeader
        eyebrow="The marketplace"
        title="Find your next card."
        description="Explore cards for sale from other collectors."
      />
      <section class="space-y-5">
        <h2 class="text-xl font-semibold">Buy at a fixed price</h2>
        <Errored
          fallback={(_error, reset) => (
            <Alert status="danger" role="alert">
              <span>Listings could not be loaded.</span>
              <Button
                variant="secondary"
                onClick={() => {
                  refresh(data);
                  reset();
                }}
              >
                Try again
              </Button>
            </Alert>
          )}
        >
          <Loading
            fallback={
              <p role="status" class="min-h-20 text-sm text-muted">
                Loading listings…
              </p>
            }
          >
            <Show
              when={listings().length}
              fallback={
                <p class="min-h-20 text-sm text-muted">
                  No cards are for sale right now.
                </p>
              }
            >
              <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <For each={listings()}>
                  {(listing) => (
                    <ListingCard
                      card={listing.card}
                      priceUsdcMinor={listing.priceUsdcMinor}
                      owner={listing.card.ownerName ?? "Collector"}
                      actionPlacement="image"
                      onAction={() => setSelection(listing)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Loading>
        </Errored>
      </section>
      <section class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">On the auction block</h2>
          <Link to="/auctions/new" class={buttonClass("secondary")}>
            List a card for bidding
          </Link>
        </div>
        <PreviewNotice>
          Auction bids and prices are examples. Open an auction to preview a
          bid.
        </PreviewNotice>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <For each={previewAuctions}>
            {(listing) => (
              <ListingCard
                card={listing.card}
                owner={listing.owner}
                priceUsdcMinor={String(listing.currentBid)}
                detail={`${listing.bidCount} bids · ${listing.timeRemaining} left`}
                auctionId={listing.id}
                action="Place a bid"
                actionPlacement="image"
              />
            )}
          </For>
        </div>
      </section>
      <Show when={selection()} keyed>
        {(listing) => (
          <PurchaseDialog
            listing={listing}
            onClose={() => setSelection(null)}
            onChanged={() => refresh(data)}
          />
        )}
      </Show>
    </Page>
  );
}
