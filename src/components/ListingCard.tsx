import { Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { haptic, type HapticFeedback } from "../lib/haptics";
import { CardArtwork } from "./GameCard";
import { Icon } from "./Icon";
import { LiquidAction } from "./LiquidAction";
import { MoneyAmount } from "./MoneyAmount";
import { RarityBadge } from "./RarityBadge";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "./ui/card";
import { Separator } from "./ui/feedback";

export function ListingCard(props: {
  card: ArticleCard;
  priceUsdcMinor: string;
  onAction?: () => void;
  owner: string;
  action?: string;
  actionPlacement?: "image" | "footer";
  auctionId?: string;
  detail?: string;
  feedback?: HapticFeedback;
}) {
  const action = () => props.action ?? "Buy now";
  const placement = () => props.actionPlacement ?? "footer";
  const actionButton = () => (
    <Show
      when={props.auctionId}
      fallback={
        <Button
          feedback={props.feedback ?? "buy"}
          disabled={!props.onAction}
          onClick={props.onAction}
          class={placement() === "image" ? "listing-action-button" : "w-full"}
          variant={placement() === "image" ? "ghost" : "secondary"}
        >
          {action()}
          <Icon name="arrow-up-right" size={15} />
        </Button>
      }
    >
      {(auctionId) => (
        <Link
          to="/auctions/$auctionId"
          params={{ auctionId: auctionId() }}
          class="btn btn-ghost listing-action-button"
          onClick={() => haptic(props.feedback ?? "buy")}
        >
          {action()}
          <Icon name="arrow-up-right" size={15} />
        </Link>
      )}
    </Show>
  );
  return (
    <Card class="h-full">
      <div class="p-2 pb-0">
        <CardArtwork
          card={props.card}
          class={placement() === "image" ? "listing-artwork" : undefined}
        >
          <Show when={placement() === "image"}>
            <LiquidAction>{actionButton()}</LiquidAction>
          </Show>
        </CardArtwork>
      </div>
      <CardContent class="space-y-3 pt-4">
        <RarityBadge rarity={props.card.rarity} />
        <CardTitle class="text-lg">{props.card.title}</CardTitle>
        <p class="text-xs text-muted">
          {props.auctionId ? `@${props.owner}` : props.owner}
        </p>
        <p class="line-clamp-2 text-sm text-muted">{props.card.description}</p>
        <Separator />
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span class="text-xs text-muted">
            {props.auctionId ? "Example bid" : "Price"}
          </span>
          <p class="font-semibold tabular-nums">
            <MoneyAmount minorUnits={props.priceUsdcMinor} />
          </p>
        </div>
        <Show when={props.detail}>
          <p class="text-xs text-muted">{props.detail}</p>
        </Show>
      </CardContent>
      <Show when={placement() === "footer"}>
        <CardFooter>{actionButton()}</CardFooter>
      </Show>
    </Card>
  );
}
