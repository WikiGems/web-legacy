import { Card, Separator } from "@heroui/react";
import { Link, useParams } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuctionAmountField, AuctionReview } from "../components/AuctionUi";
import { CardArtwork } from "../components/GameCard";
import { HapticButton as Button } from "../components/HapticButton";
import { Icon } from "../components/Icon";
import { LiquidAction } from "../components/LiquidAction";
import { LiquidPage } from "../components/LiquidPage";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
import { RarityBadge } from "../components/RarityBadge";
import {
  formatAuctionAmount,
  parseAuctionAmount,
  previewAuctions,
} from "../lib/auction-preview";
import { haptic } from "../lib/haptics";

type PreviewAuction = (typeof previewAuctions)[number];

export default function Bid() {
  const { auctionId } = useParams({ strict: false });
  const auction = previewAuctions.find((item) => item.id === auctionId);
  if (!auction) {
    return (
      <Page>
        <PageHeader
          eyebrow="The auction room"
          title="Auction not found"
          description="This auction is not in the sample marketplace."
        />
        <Link to="/buy" className="button button--secondary">
          Back to the marketplace
        </Link>
      </Page>
    );
  }
  return <BidAuction key={auction.id} auction={auction} />;
}

function BidAuction({ auction }: { auction: PreviewAuction }) {
  const minimum = auction.currentBid + auction.increment;
  const [amount, setAmount] = useState(formatAuctionAmount(minimum));
  const [error, setError] = useState("");
  const [review, setReview] = useState<number | null>(null);

  function reviewBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAuctionAmount(amount);
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
    <LiquidPage>
      <Link
        to="/buy"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <Icon name="arrow-right" className="rotate-180" size={16} /> Back to the
        marketplace
      </Link>
      <PageHeader
        eyebrow="The auction room"
        title={auction.card.title}
        description="A one-of-one article card. Explore the listing and prepare your bid."
        action={<PreviewChip />}
      />
      <PreviewNotice>
        This auction, seller and bid history are examples. You can review a bid;
        submitting bids and transferring funds are not available yet.
      </PreviewNotice>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardArtwork card={auction.card} className="listing-artwork">
            <LiquidAction>
              <a
                href={auction.card.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--ghost listing-action-button"
              >
                Read article <Icon name="external" size={15} />
              </a>
            </LiquidAction>
          </CardArtwork>
          <Card.Content className="space-y-4">
            <RarityBadge rarity={auction.card.rarity} />
            <Card.Description>{auction.card.description}</Card.Description>
            <p className="text-sm text-muted">Listed by @{auction.owner}</p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>Your bid</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-6">
            <dl className="grid grid-cols-2 gap-5">
              <div>
                <dt className="text-xs text-muted">Current example bid</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatAuctionAmount(auction.currentBid)}{" "}
                  <span className="text-sm font-normal">USDC</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Example time remaining</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {auction.timeRemaining}
                </dd>
              </div>
            </dl>
            <Separator />
            <form onSubmit={reviewBid} noValidate className="space-y-4">
              <AuctionAmountField
                label="Your bid"
                value={amount}
                onChange={(value) => {
                  setAmount(value);
                  setError("");
                }}
              />
              <p className="text-xs leading-relaxed text-muted">
                Minimum next bid: {formatAuctionAmount(minimum)} USDC. Each new
                bid must be at least {formatAuctionAmount(auction.increment)}{" "}
                USDC higher.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setAmount(formatAuctionAmount(minimum));
                    setError("");
                  }}
                >
                  Minimum bid
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setAmount(formatAuctionAmount(minimum + 100_000));
                    setError("");
                  }}
                >
                  Minimum + 0.10 USDC
                </Button>
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <LiquidAction className="w-full">
                <Button
                  type="submit"
                  feedback={false}
                  variant="ghost"
                  className="listing-action-button w-full"
                >
                  Review bid <Icon name="arrow-right" size={17} />
                </Button>
              </LiquidAction>
              <p className="text-xs text-muted">
                Reviewing a bid does not submit it.
              </p>
            </form>
          </Card.Content>
        </Card>
      </div>
      <Card>
        <Card.Header className="flex-row items-center justify-between gap-3">
          <Card.Title>Recent example bids</Card.Title>
          <span className="text-xs text-muted">
            {auction.bidCount} bids in total
          </span>
        </Card.Header>
        <Card.Content>
          <ul className="divide-y divide-separator">
            {auction.bids.map((bid) => (
              <li
                key={bid.bidder}
                className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
              >
                <div>
                  <p className="font-medium">@{bid.bidder}</p>
                  <p className="mt-1 text-xs text-muted">{bid.time}</p>
                </div>
                <span className="font-semibold tabular-nums">
                  {formatAuctionAmount(bid.amount)} USDC
                </span>
              </li>
            ))}
          </ul>
        </Card.Content>
      </Card>
      {review !== null && (
        <AuctionReview
          title="Review your bid"
          submitLabel="Place bid"
          onClose={() => setReview(null)}
        >
          <dl className="space-y-4 rounded-2xl bg-default/50 p-4 text-sm">
            <div>
              <dt className="text-muted">Card</dt>
              <dd className="mt-1 font-semibold">{auction.card.title}</dd>
            </div>
            <div>
              <dt className="text-muted">Your proposed bid</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatAuctionAmount(review)} USDC
              </dd>
            </div>
            <div>
              <dt className="text-muted">Seller</dt>
              <dd className="mt-1">@{auction.owner}</dd>
            </div>
          </dl>
        </AuctionReview>
      )}
    </LiquidPage>
  );
}
