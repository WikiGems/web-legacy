import { Card, Chip } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { Icon } from "./Icon";
import { RarityBadge } from "./RarityBadge";

type CardSize = "xs" | "sm" | "md" | "lg";
export function CardArtwork({
  card,
  className,
  children,
}: {
  card: ArticleCard;
  className?: string;
  children?: ReactNode;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return (
    <div
      className={clsx(
        "relative isolate flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-default",
        className,
      )}
    >
      {card.imageUrl && failedImage !== card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailedImage(card.imageUrl)}
        />
      ) : (
        <Icon name="globe" size={48} className="text-muted/40" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/55 to-transparent" />
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-white">
          {card.category}
        </span>
        {children}
      </div>
      <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-black backdrop-blur-sm">
        1 of 1
      </span>
    </div>
  );
}

export function GameCard({
  card,
  size = "md",
  onClick,
  className,
}: {
  card: ArticleCard;
  size?: CardSize;
  onClick?: (card: ArticleCard) => void;
  className?: string;
}) {
  return (
    <Card className={clsx("h-full min-w-0", className)}>
      <CardArtwork card={card} />
      <Card.Content className="flex-1 space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RarityBadge rarity={card.rarity} />
          {(card.status === "minted" || card.forTrade) && (
            <span className="text-xs text-muted">
              {card.status === "minted" ? "On Solana" : "Open to trades"}
            </span>
          )}
        </div>
        <Card.Title className={size === "xs" ? "text-sm" : "text-lg"}>
          {card.title}
        </Card.Title>
        {size !== "xs" && (
          <Card.Description className="line-clamp-2 text-sm leading-relaxed">
            {card.description || card.extract}
          </Card.Description>
        )}
      </Card.Content>
      {onClick && (
        <Card.Footer>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => onClick(card)}
            className="w-full"
            aria-label={`View details for ${card.title}`}
          >
            View details
            <Icon name="arrow-up-right" size={14} />
          </Button>
        </Card.Footer>
      )}
    </Card>
  );
}

export function CardBack({
  className,
  label = "1 of 1",
}: {
  size?: CardSize;
  className?: string;
  label?: string;
}) {
  return (
    <Card
      aria-hidden="true"
      className={clsx(
        "flex aspect-[3/4] items-center justify-center bg-accent-soft text-accent-soft-foreground",
        className,
      )}
    >
      <div className="space-y-4 text-center">
        <Icon name="spark" size={38} className="mx-auto" />
        <p className="font-semibold">WikiGems</p>
        <Chip size="sm" color="accent" variant="soft">
          <Chip.Label>{label}</Chip.Label>
        </Chip>
      </div>
    </Card>
  );
}
