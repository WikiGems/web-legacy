import { createSignal, For, Show } from "solid-js";
import { Link, useParams } from "@tanstack/solid-router";
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
import { Button, buttonClass } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Separator } from "../components/ui/feedback";
import {
  formatAuctionAmount,
  parseAuctionAmount,
  previewAuctions,
} from "../lib/auction-preview";
import { haptic } from "../lib/haptics";

type PreviewAuction = (typeof previewAuctions)[number];

export default function Bid() {
  const params = useParams({ strict: false });
  const auction = () =>
    previewAuctions.find((item) => item.id === params().auctionId);
  return (
    <Show
      when={auction()}
      keyed
      fallback={
        <Page>
          <PageHeader
            eyebrow="The auction room"
            title="Auction not found"
            description="This auction is not in the sample marketplace."
          />
          <Link to="/buy" class={buttonClass("secondary")}>
            Back to the marketplace
          </Link>
        </Page>
      }
    >
      {(found) => <BidAuction auction={found} />}
    </Show>
  );
}

function BidAuction(props: { auction: PreviewAuction }) {
  const minimum = props.auction.currentBid + props.auction.increment;
  const [amount, setAmount] = createSignal(formatAuctionAmount(minimum));
  const [error, setError] = createSignal("");
  const [review, setReview] = createSignal<number | null>(null);

  function reviewBid(event: SubmitEvent) {
    event.preventDefault();
    const parsed = parseAuctionAmount(amount());
    if (parsed === null || parsed < minimum) {
      setError(
        `Enter at least ${formatAuctionAmount(minimum)} USDC, using up to 6 decimal places.`,
      );
      haptic("error");
      return;
    }
    setError("");
    setReview(parsed);
    haptic("confirm");
  }

  return (
    <Page>
      <Link
        to="/buy"
        class="inline-flex items-center gap-2 text-sm text-muted hover:text-base-content"
      >
        <Icon name="arrow-right" class="rotate-180" size={16} /> Back to the
        marketplace
      </Link>
      <PageHeader
        eyebrow="The auction room"
        title={props.auction.card.title}
        description="A one-of-one article card. Explore the listing and prepare your bid."
        action={<PreviewChip />}
      />
      <PreviewNotice>
        This auction, seller and bid history are examples. You can review a bid;
        submitting bids and transferring funds are not available yet.
      </PreviewNotice>
      <div class="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <div class="p-2 pb-0">
            <CardArtwork card={props.auction.card} class="listing-artwork">
              <LiquidAction>
                <a
                  href={props.auction.card.articleUrl}
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
            <RarityBadge rarity={props.auction.card.rarity} />
            <CardDescription>{props.auction.card.description}</CardDescription>
            <p class="text-sm text-muted">Listed by @{props.auction.owner}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your bid</CardTitle>
          </CardHeader>
          <CardContent class="space-y-6">
            <dl class="grid grid-cols-2 gap-5">
              <div>
                <dt class="text-xs text-muted">Current example bid</dt>
                <dd class="mt-1 text-2xl font-semibold tabular-nums">
                  {formatAuctionAmount(props.auction.currentBid)}{" "}
                  <span class="text-sm font-normal">USDC</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">Example time remaining</dt>
                <dd class="mt-1 text-2xl font-semibold">
                  {props.auction.timeRemaining}
                </dd>
              </div>
            </dl>
            <Separator />
            <form onSubmit={reviewBid} novalidate class="space-y-4">
              <AuctionAmountField
                label="Your bid"
                value={amount()}
                onChange={(value) => {
                  setAmount(value);
                  setError("");
                }}
              />
              <p class="text-xs leading-relaxed text-muted">
                Minimum next bid: {formatAuctionAmount(minimum)} USDC. Each new
                bid must be at least{" "}
                {formatAuctionAmount(props.auction.increment)} USDC higher.
              </p>
              <div class="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAmount(formatAuctionAmount(minimum));
                    setError("");
                  }}
                >
                  Minimum bid
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAmount(formatAuctionAmount(minimum + 100_000));
                    setError("");
                  }}
                >
                  Minimum + 0.10 USDC
                </Button>
              </div>
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
                  Review bid <Icon name="arrow-right" size={17} />
                </Button>
              </LiquidAction>
              <p class="text-xs text-muted">
                Reviewing a bid does not submit it.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader class="flex-row items-center justify-between gap-3">
          <CardTitle>Recent example bids</CardTitle>
          <span class="text-xs text-muted">
            {props.auction.bidCount} bids in total
          </span>
        </CardHeader>
        <CardContent>
          <ul class="divide-y divide-base-300">
            <For each={props.auction.bids}>
              {(bid) => (
                <li class="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                  <div>
                    <p class="font-medium">@{bid.bidder}</p>
                    <p class="mt-1 text-xs text-muted">{bid.time}</p>
                  </div>
                  <span class="font-semibold tabular-nums">
                    {formatAuctionAmount(bid.amount)} USDC
                  </span>
                </li>
              )}
            </For>
          </ul>
        </CardContent>
      </Card>
      <Show when={review()}>
        {(proposed) => (
          <AuctionReview
            title="Review your bid"
            submitLabel="Place bid"
            onClose={() => setReview(null)}
          >
            <dl class="space-y-4 rounded-2xl bg-base-200 p-4 text-sm">
              <div>
                <dt class="text-muted">Card</dt>
                <dd class="mt-1 font-semibold">{props.auction.card.title}</dd>
              </div>
              <div>
                <dt class="text-muted">Your proposed bid</dt>
                <dd class="mt-1 text-xl font-semibold tabular-nums">
                  {formatAuctionAmount(proposed())} USDC
                </dd>
              </div>
              <div>
                <dt class="text-muted">Seller</dt>
                <dd class="mt-1">@{props.auction.owner}</dd>
              </div>
            </dl>
          </AuctionReview>
        )}
      </Show>
    </Page>
  );
}
