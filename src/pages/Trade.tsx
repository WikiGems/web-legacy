import { createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { Api } from "@wikigems/client";
import type {
  Card as ArticleCard,
  Trade as TradeOffer,
} from "@wikigems/domain/domain";
import { Effect } from "effect";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { GameCard } from "../components/GameCard";
import { TradeOfferModal } from "../components/TradeOfferModal";
import { Page, PageHeader } from "../components/Page";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, Chip, Separator } from "../components/ui/feedback";
import { marketError } from "../lib/market-ui";
import { showToast } from "../lib/ui";
import { createAsync, runUi } from "../runtime";

export default function Trade() {
  const data = createAsync(() =>
    Api.use((api) =>
      Effect.all(
        {
          market: api.fetchMarket(),
          game: api.fetchGameState(),
          trades: api.fetchTrades(),
        },
        { concurrency: "unbounded" },
      ),
    ),
  );
  const [target, setTarget] = createSignal<ArticleCard | null>(null);
  const wanted = () => {
    const { game, market } = data();
    const owned = new Set(game.cards.map((card) => card.id));
    return market.cards.filter((card) => !owned.has(card.id));
  };
  const offers = () => [
    ...data().trades.incoming.map((offer) => ({ offer, incoming: true })),
    ...data().trades.outgoing.map((offer) => ({ offer, incoming: false })),
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="The exchange"
        title="Trade a little knowledge."
        description="Exchange cards from your collection with other collectors."
      />
      <Errored
        fallback={(_error, reset) => (
          <Alert status="danger" role="alert">
            <span>Trades could not be loaded.</span>
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
              Loading trades…
            </p>
          }
        >
          <section class="space-y-5">
            <h2 class="text-xl font-semibold">Open to a good trade</h2>
            <Show
              when={wanted().length}
              fallback={
                <p class="text-sm text-muted">
                  No cards are open to trade right now.
                </p>
              }
            >
              <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <For each={wanted()}>
                  {(card) => (
                    <GameCard
                      card={card}
                      action="Propose a trade"
                      onClick={setTarget}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>
          <section class="space-y-5">
            <h2 class="text-xl font-semibold">At the exchange table</h2>
            <Show
              when={offers().length}
              fallback={
                <p class="text-sm text-muted">Your trade offers appear here.</p>
              }
            >
              <div class="grid gap-5 md:grid-cols-2">
                <For each={offers()}>
                  {({ offer, incoming }) => (
                    <TradeEntry
                      trade={offer}
                      incoming={incoming}
                      onChanged={() => refresh(data)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>
          <Show when={target()} keyed>
            {(card) => (
              <TradeOfferModal
                target={card}
                cards={data().game.cards}
                onClose={() => setTarget(null)}
                onSubmitted={() => {
                  setTarget(null);
                  refresh(data);
                }}
              />
            )}
          </Show>
        </Loading>
      </Errored>
    </Page>
  );
}

function TradeEntry(props: {
  trade: TradeOffer;
  incoming: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const name = () =>
    props.incoming ? props.trade.proposerName : props.trade.counterpartyName;
  const status: Record<TradeOffer["status"], string> = {
    proposed: "Pending",
    settled: "Accepted",
    declined: "Declined",
    cancelled: "Cancelled",
  };
  async function decide(action: "accept" | "decline" | "cancel") {
    setBusy(true);
    const result = await runUi(
      Api.use((api) => api.settleTrade(props.trade.id, action)),
      (failure) =>
        showToast("Could not update the trade", {
          body: marketError(failure),
          tone: "error",
        }),
    );
    setBusy(false);
    if (result.ok) {
      showToast(
        action === "accept"
          ? "Cards exchanged"
          : action === "decline"
            ? "Trade declined"
            : "Trade cancelled",
        { tone: "success" },
      );
      props.onChanged();
    }
  }
  return (
    <Card>
      <CardHeader class="flex-row items-center gap-3 pb-0">
        <Avatar name={name()} />
        <CardTitle class="min-w-0 flex-1 truncate text-sm">{name()}</CardTitle>
        <Chip tone={props.incoming ? "accent" : "default"}>
          {props.incoming ? "Incoming" : "Outgoing"}
        </Chip>
      </CardHeader>
      <CardContent class="space-y-4">
        <Separator />
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm">
          <div class="min-w-0">
            <p class="mb-1 text-xs text-muted">Offered</p>
            <p class="font-medium">{props.trade.offeredCard.title}</p>
          </div>
          <Icon name="swap" class="text-muted" />
          <div class="min-w-0 text-right">
            <p class="mb-1 text-xs text-muted">Requested</p>
            <p class="font-medium">{props.trade.requestedCard.title}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Show
          when={props.trade.status === "proposed"}
          fallback={
            <span class="text-sm text-muted">{status[props.trade.status]}</span>
          }
        >
          <Show
            when={props.incoming}
            fallback={
              <Button
                variant="secondary"
                pending={busy()}
                onClick={() => void decide("cancel")}
              >
                Cancel offer
              </Button>
            }
          >
            <Button pending={busy()} onClick={() => void decide("accept")}>
              Accept
            </Button>
            <Button
              variant="secondary"
              disabled={busy()}
              onClick={() => void decide("decline")}
            >
              Decline
            </Button>
          </Show>
        </Show>
      </CardFooter>
    </Card>
  );
}
