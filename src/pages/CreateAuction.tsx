import { createMemo, createSignal, For, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { AuctionAmountField, AuctionReview } from "../components/AuctionUi";
import { CardArtwork } from "../components/GameCard";
import { Icon } from "../components/Icon";
import { LiquidAction } from "../components/LiquidAction";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
import { RarityBadge } from "../components/RarityBadge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Separator } from "../components/ui/feedback";
import {
  auctionCards,
  formatAuctionAmount,
  parseAuctionAmount,
} from "../lib/auction-preview";
import { haptic } from "../lib/haptics";

type AuctionDraft = {
  card: ArticleCard;
  startingBid: number;
  increment: number;
  duration: number;
};

export default function CreateAuction() {
  const [cardId, setCardId] = createSignal(auctionCards[0]?.id ?? "");
  const [startingBid, setStartingBid] = createSignal("0.25");
  const [increment, setIncrement] = createSignal("0.05");
  const [duration, setDuration] = createSignal(3);
  const [error, setError] = createSignal("");
  const [review, setReview] = createSignal<AuctionDraft | null>(null);
  const selected = createMemo(() =>
    auctionCards.find((card) => card.id === cardId()),
  );
  const previewPrice = createMemo(() => parseAuctionAmount(startingBid()));
  const previewIncrement = createMemo(() => parseAuctionAmount(increment()));

  function reviewAuction(event: SubmitEvent) {
    event.preventDefault();
    const card = selected();
    const price = previewPrice();
    const step = previewIncrement();
    if (!card || price === null || step === null) {
      setError(
        "Choose a card and enter a positive starting bid and minimum increment, using up to 6 decimal places.",
      );
      haptic("error");
      return;
    }
    setError("");
    setReview({
      card,
      startingBid: price,
      increment: step,
      duration: duration(),
    });
    haptic("confirm");
  }

  return (
    <Show
      when={selected()}
      fallback={
        <Page>
          <p>No sample cards are available to preview.</p>
        </Page>
      }
    >
      {(card) => (
        <Page>
          <Link
            to="/sell"
            class="inline-flex items-center gap-2 text-sm text-muted hover:text-base-content"
          >
            <Icon name="arrow-right" class="rotate-180" size={16} /> Back to
            your storefront
          </Link>
          <PageHeader
            eyebrow="Your auction"
            title="List a card for bidding"
            description="Choose a card, set an opening bid and give collectors time to discover it."
            action={<PreviewChip />}
          />
          <PreviewNotice>
            Try an auction with sample cards. These are not your owned cards;
            reviewing this form will not publish a listing.
          </PreviewNotice>
          <div class="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Auction details</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={reviewAuction} novalidate class="space-y-6">
                  <div class="flex flex-col gap-1.5">
                    <label for="auction-card" class="text-sm font-medium">
                      Sample card
                    </label>
                    <select
                      id="auction-card"
                      class="select w-full"
                      value={cardId()}
                      onChange={(event) => setCardId(event.currentTarget.value)}
                    >
                      <For each={auctionCards}>
                        {(option) => (
                          <option value={option.id}>{option.title}</option>
                        )}
                      </For>
                    </select>
                  </div>
                  <AuctionAmountField
                    label="Starting bid"
                    value={startingBid()}
                    onChange={(value) => {
                      setStartingBid(value);
                      setError("");
                    }}
                  />
                  <AuctionAmountField
                    label="Minimum increment"
                    value={increment()}
                    onChange={(value) => {
                      setIncrement(value);
                      setError("");
                    }}
                  />
                  <p class="text-xs text-muted">
                    Amounts support up to 6 decimal places. Each new bid must
                    exceed the current bid by at least the minimum increment.
                  </p>
                  <fieldset class="space-y-3">
                    <legend class="text-sm font-medium">
                      Auction duration
                    </legend>
                    <div class="flex flex-wrap gap-2">
                      <For each={[1, 3, 7]}>
                        {(days) => (
                          <Button
                            variant={
                              duration() === days ? "primary" : "secondary"
                            }
                            aria-pressed={
                              duration() === days ? "true" : "false"
                            }
                            onClick={() => setDuration(days)}
                          >
                            {days} {days === 1 ? "day" : "days"}
                          </Button>
                        )}
                      </For>
                    </div>
                  </fieldset>
                  <Show when={error()}>
                    <p role="alert" class="text-sm text-error">
                      {error()}
                    </p>
                  </Show>
                  <LiquidAction class="w-full">
                    <Button
                      type="submit"
                      feedback={false}
                      variant="ghost"
                      class="listing-action-button w-full"
                    >
                      Review auction <Icon name="arrow-right" size={17} />
                    </Button>
                  </LiquidAction>
                </form>
              </CardContent>
            </Card>
            <Card aria-label="Auction preview">
              <div class="p-2 pb-0">
                <CardArtwork card={card()} class="listing-artwork">
                  <LiquidAction>
                    <a
                      href={card().articleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn btn-ghost listing-action-button"
                    >
                      Read article <Icon name="external" size={15} />
                    </a>
                  </LiquidAction>
                </CardArtwork>
              </div>
              <CardContent class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <RarityBadge rarity={card().rarity} />
                  <span class="text-xs text-muted">Listing preview</span>
                </div>
                <CardTitle>{card().title}</CardTitle>
                <CardDescription>{card().description}</CardDescription>
                <Separator />
                <dl class="space-y-3 text-sm">
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted">Starting bid</dt>
                    <dd class="font-semibold tabular-nums">
                      {previewPrice() === null
                        ? "—"
                        : `$${formatAuctionAmount(previewPrice()!)}`}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted">Minimum increment</dt>
                    <dd class="tabular-nums">
                      {previewIncrement() === null
                        ? "—"
                        : `$${formatAuctionAmount(previewIncrement()!)}`}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted">Duration</dt>
                    <dd>
                      {duration()} {duration() === 1 ? "day" : "days"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
          <Show when={review()}>
            {(draft) => (
              <AuctionReview
                title="Review your auction"
                submitLabel="Publish auction"
                onClose={() => setReview(null)}
              >
                <dl class="space-y-4 rounded-2xl bg-base-200 p-4 text-sm">
                  <div>
                    <dt class="text-muted">Card</dt>
                    <dd class="mt-1 font-semibold">{draft().card.title}</dd>
                  </div>
                  <div>
                    <dt class="text-muted">Starting bid</dt>
                    <dd class="mt-1 text-xl font-semibold tabular-nums">
                      ${formatAuctionAmount(draft().startingBid)}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">Minimum increment</dt>
                    <dd class="mt-1 tabular-nums">
                      ${formatAuctionAmount(draft().increment)}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">Duration</dt>
                    <dd class="mt-1">
                      {draft().duration}{" "}
                      {draft().duration === 1 ? "day" : "days"}
                    </dd>
                  </div>
                </dl>
              </AuctionReview>
            )}
          </Show>
        </Page>
      )}
    </Show>
  );
}
