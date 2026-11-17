import { Card, Label, Separator } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { AuctionAmountField, AuctionReview } from "../components/AuctionUi";
import { CardArtwork } from "../components/GameCard";
import { HapticButton as Button } from "../components/HapticButton";
import { Icon } from "../components/Icon";
import { LiquidAction } from "../components/LiquidAction";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
} from "../components/Page";
import { RarityBadge } from "../components/RarityBadge";
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
  const [cardId, setCardId] = useState(auctionCards[0]?.id ?? "");
  const [startingBid, setStartingBid] = useState("0.25");
  const [increment, setIncrement] = useState("0.05");
  const [duration, setDuration] = useState(3);
  const [error, setError] = useState("");
  const [review, setReview] = useState<AuctionDraft | null>(null);
  const selected = auctionCards.find((card) => card.id === cardId);

  function reviewAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = parseAuctionAmount(startingBid);
    const step = parseAuctionAmount(increment);
    if (!selected || price === null || step === null) {
      setError(
        "Choose a card and enter a positive starting bid and minimum increment, using up to 6 decimal places.",
      );
      haptic("error");
      return;
    }
    setError("");
    setReview({
      card: selected,
      startingBid: price,
      increment: step,
      duration,
    });
    haptic("confirm");
  }

  if (!selected)
    return (
      <Page>
        <p>No sample cards are available to preview.</p>
      </Page>
    );
  const previewPrice = parseAuctionAmount(startingBid);
  const previewIncrement = parseAuctionAmount(increment);

  return (
    <Page>
      <Link
        to="/sell"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <Icon name="arrow-right" className="rotate-180" size={16} /> Back to
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
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>Auction details</Card.Title>
          </Card.Header>
          <Card.Content>
            <form onSubmit={reviewAuction} noValidate className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="auction-card">Sample card</Label>
                <select
                  id="auction-card"
                  className="input w-full appearance-auto"
                  value={cardId}
                  onChange={(event) => setCardId(event.target.value)}
                >
                  {auctionCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.title}
                    </option>
                  ))}
                </select>
              </div>
              <AuctionAmountField
                label="Starting bid"
                value={startingBid}
                onChange={(value) => {
                  setStartingBid(value);
                  setError("");
                }}
              />
              <AuctionAmountField
                label="Minimum increment"
                value={increment}
                onChange={(value) => {
                  setIncrement(value);
                  setError("");
                }}
              />
              <p className="text-xs text-muted">
                Amounts support up to 6 decimal places. Each new bid must exceed
                the current bid by at least the minimum increment.
              </p>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  Auction duration
                </legend>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 7].map((days) => (
                    <Button
                      key={days}
                      variant={duration === days ? "primary" : "secondary"}
                      aria-pressed={duration === days}
                      onPress={() => setDuration(days)}
                    >
                      {days} {days === 1 ? "day" : "days"}
                    </Button>
                  ))}
                </div>
              </fieldset>
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
                  Review auction <Icon name="arrow-right" size={17} />
                </Button>
              </LiquidAction>
            </form>
          </Card.Content>
        </Card>
        <Card aria-label="Auction preview">
          <CardArtwork card={selected} className="listing-artwork">
            <LiquidAction>
              <a
                href={selected.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--ghost listing-action-button"
              >
                Read article <Icon name="external" size={15} />
              </a>
            </LiquidAction>
          </CardArtwork>
          <Card.Content className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RarityBadge rarity={selected.rarity} />
              <span className="text-xs text-muted">Listing preview</span>
            </div>
            <Card.Title>{selected.title}</Card.Title>
            <Card.Description>{selected.description}</Card.Description>
            <Separator />
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Starting bid</dt>
                <dd className="font-semibold tabular-nums">
                  {previewPrice === null
                    ? "—"
                    : `${formatAuctionAmount(previewPrice)} USDC`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Minimum increment</dt>
                <dd className="tabular-nums">
                  {previewIncrement === null
                    ? "—"
                    : `${formatAuctionAmount(previewIncrement)} USDC`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Duration</dt>
                <dd>
                  {duration} {duration === 1 ? "day" : "days"}
                </dd>
              </div>
            </dl>
          </Card.Content>
        </Card>
      </div>
      {review && (
        <AuctionReview
          title="Review your auction"
          submitLabel="Publish auction"
          onClose={() => setReview(null)}
        >
          <dl className="space-y-4 rounded-2xl bg-default/50 p-4 text-sm">
            <div>
              <dt className="text-muted">Card</dt>
              <dd className="mt-1 font-semibold">{review.card.title}</dd>
            </div>
            <div>
              <dt className="text-muted">Starting bid</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatAuctionAmount(review.startingBid)} USDC
              </dd>
            </div>
            <div>
              <dt className="text-muted">Minimum increment</dt>
              <dd className="mt-1 tabular-nums">
                {formatAuctionAmount(review.increment)} USDC
              </dd>
            </div>
            <div>
              <dt className="text-muted">Duration</dt>
              <dd className="mt-1">
                {review.duration} {review.duration === 1 ? "day" : "days"}
              </dd>
            </div>
          </dl>
        </AuctionReview>
      )}
    </Page>
  );
}
