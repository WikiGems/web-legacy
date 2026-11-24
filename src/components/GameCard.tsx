import { createSignal, Show, type ParentProps } from "solid-js";
import type { Card as ArticleCard } from "@wikigems/domain/domain";
import { Icon } from "./Icon";
import { RarityBadge } from "./RarityBadge";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "./ui/card";
import { Chip } from "./ui/feedback";

type CardSize = "xs" | "sm" | "md" | "lg";

export function CardArtwork(
  props: ParentProps<{ card: ArticleCard; class?: string }>,
) {
  const [failedImage, setFailedImage] = createSignal<string | null>(null);
  return (
    <div
      class={[
        "relative isolate flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-base-200",
        props.class,
      ]}
    >
      <Show
        when={props.card.imageUrl && failedImage() !== props.card.imageUrl}
        fallback={<Icon name="globe" size={48} class="text-muted/40" />}
      >
        <img
          src={props.card.imageUrl ?? undefined}
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
          class="size-full object-cover"
          onError={() => setFailedImage(props.card.imageUrl)}
        />
      </Show>
      <div class="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/55 to-transparent" />
      <div class="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
        <span class="min-w-0 truncate text-xs font-medium text-white">
          {props.card.category}
        </span>
        {props.children}
      </div>
      <span class="absolute top-3 right-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-black backdrop-blur-sm">
        1 of 1
      </span>
    </div>
  );
}

export function GameCard(props: {
  card: ArticleCard;
  size?: CardSize;
  onClick?: (card: ArticleCard) => void;
  action?: string;
  class?: string;
}) {
  return (
    <Card class={["h-full", props.class]}>
      <div class="p-2 pb-0">
        <CardArtwork card={props.card} />
      </div>
      <CardContent class="flex-1 space-y-3 pt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <RarityBadge rarity={props.card.rarity} />
          <Show when={props.card.status === "minted" || props.card.forTrade}>
            <span class="text-xs text-muted">
              {props.card.status === "minted"
                ? "In a wallet"
                : "Open to trades"}
            </span>
          </Show>
        </div>
        <CardTitle class={props.size === "xs" ? "text-sm" : "text-lg"}>
          {props.card.title}
        </CardTitle>
        <Show when={props.size !== "xs"}>
          <p class="line-clamp-2 text-sm leading-relaxed text-muted">
            {props.card.description || props.card.extract}
          </p>
        </Show>
      </CardContent>
      <Show when={props.onClick}>
        {(onClick) => (
          <CardFooter>
            <Button
              variant="secondary"
              size="sm"
              class="w-full"
              aria-label={`${props.action ?? "View details"} for ${props.card.title}`}
              onClick={() => onClick()(props.card)}
            >
              {props.action ?? "View details"}
              <Icon name="arrow-up-right" size={14} />
            </Button>
          </CardFooter>
        )}
      </Show>
    </Card>
  );
}

export function CardBack(props: { class?: string; label?: string }) {
  return (
    <Card
      aria-hidden="true"
      class={[
        "flex aspect-[3/4] items-center justify-center bg-base-200",
        props.class,
      ]}
    >
      <div class="space-y-4 text-center">
        <Icon name="spark" size={38} class="mx-auto" />
        <p class="font-semibold">WikiGems</p>
        <Chip tone="accent">{props.label ?? "1 of 1"}</Chip>
      </div>
    </Card>
  );
}
