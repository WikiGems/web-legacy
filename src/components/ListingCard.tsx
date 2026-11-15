import { MoneyAmount } from "./MoneyAmount";
import type { HapticFeedback } from "../lib/haptics";
import { Card, Separator } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { CardArtwork } from "./GameCard";
import { RarityBadge } from "./RarityBadge";
import { Icon } from "./Icon";
import { Link } from "@tanstack/react-router";
import { LiquidAction } from "./LiquidAction";
import { haptic } from "../lib/haptics";

export function ListingCard({
  card,
  price,
  owner,
  action = "Buy now",
  actionPlacement = "footer",
  auctionId,
  detail,
  feedback = "buy",
}: {
  card: ArticleCard;
  price: number;
  owner: string;
  action?: string;
  actionPlacement?: "image" | "footer";
  auctionId?: string;
  detail?: string;
  feedback?: HapticFeedback;
}) {
  const actionButton = auctionId ? (
    <Link
      to="/auctions/$auctionId"
      params={{ auctionId }}
      className="button button--ghost listing-action-button"
      onClick={() => haptic(feedback)}
    >
      {action}
      <Icon name="arrow-up-right" size={15} />
    </Link>
  ) : (
    <Button
      feedback={feedback}
      isDisabled
      className={
        actionPlacement === "image" ? "listing-action-button" : "w-full"
      }
      variant={actionPlacement === "image" ? "ghost" : "secondary"}
    >
      {action}
      <Icon name="arrow-up-right" size={15} />
    </Button>
  );
  return (
    <Card className="h-full min-w-0">
      <CardArtwork
        card={card}
        className={actionPlacement === "image" ? "listing-artwork" : undefined}
      >
        {actionPlacement === "image" && (
          <LiquidAction>{actionButton}</LiquidAction>
        )}
      </CardArtwork>
      <Card.Content className="space-y-3 pt-2">
        <RarityBadge rarity={card.rarity} />
        <Card.Title className="text-lg">{card.title}</Card.Title>
        <p className="text-xs text-muted">@{owner}</p>
        <Card.Description className="line-clamp-2 text-sm">
          {card.description}
        </Card.Description>
        <Separator />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Example price</span>
          <p className="font-semibold tabular-nums">
            <MoneyAmount
              amount={price}
              currency="USDC"
              unitClassName="text-xs font-normal text-muted"
            />
          </p>
        </div>
        {detail && <p className="text-xs text-muted">{detail}</p>}
      </Card.Content>
      {actionPlacement === "footer" && (
        <Card.Footer>{actionButton}</Card.Footer>
      )}
    </Card>
  );
}
