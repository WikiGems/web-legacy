import { For, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { GameCard } from "../components/GameCard";
import { ListingCard } from "../components/ListingCard";
import { OwnedCards } from "../components/OwnedCards";
import { Page, PageHeader } from "../components/Page";
import { buttonClass } from "../components/ui/button";

export default function Sell() {
  return (
    <Page>
      <PageHeader
        eyebrow="Your storefront"
        title="Your cards for sale."
        description="Set prices for cards in your collection."
        action={
          <Link to="/auctions/new" class={buttonClass("secondary")}>
            List a card for bidding
          </Link>
        }
      />
      <OwnedCards initialAction="price">
        {({ cards, open }) => {
          const eligible = () =>
            cards().filter((card) => card.status === "claimed");
          return (
            <section class="space-y-5">
              <h2 class="text-xl font-semibold">Manage prices</h2>
              <Show
                when={eligible().length}
                fallback={
                  <p class="text-sm text-muted">
                    Cards in your collection can be listed before moving them to
                    a wallet.
                  </p>
                }
              >
                <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={eligible()}>
                    {(card) => (
                      <Show
                        when={card.priceUsdcMinor}
                        fallback={
                          <GameCard
                            card={card}
                            onClick={open}
                            action="Set a price"
                          />
                        }
                      >
                        {(price) => (
                          <ListingCard
                            card={card}
                            priceUsdcMinor={price()}
                            owner="You"
                            feedback="sell"
                            action="Edit price"
                            onAction={() => open(card)}
                          />
                        )}
                      </Show>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          );
        }}
      </OwnedCards>
    </Page>
  );
}
