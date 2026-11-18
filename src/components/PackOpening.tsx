import { createSignal, For, Show } from "solid-js";
import type { Card } from "@wikigems/domain/domain";
import { CardBack, GameCard } from "./GameCard";
import { Icon } from "./Icon";
import { Button } from "./ui/button";
import { WebDialog } from "./WebDialog";

export function PackOpening(props: {
  cards: Card[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [revealed, setRevealed] = createSignal(props.cards.map(() => false));
  const allRevealed = () => revealed().every(Boolean);
  const count = () => revealed().filter(Boolean).length;
  return (
    <WebDialog onClose={props.onClose} labelId="pack-title" wide>
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-2">
          <p class="text-xs font-medium text-primary">
            A new pack · {props.cards.length} cards
          </p>
          <h2 id="pack-title" class="text-2xl font-semibold">
            {allRevealed()
              ? "A new page in your collection."
              : "A little mystery awaits."}
          </h2>
        </div>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          onClick={props.onClose}
          aria-label="Close pack"
        >
          <Icon name="close" />
        </Button>
      </div>
      <div class="grid grid-cols-1 items-start gap-4 min-[400px]:grid-cols-2 sm:grid-cols-3">
        <For each={props.cards}>
          {(card, index) => (
            <div>
              <Show
                when={revealed()[index()]}
                fallback={
                  <Button
                    variant="ghost"
                    class="h-auto w-full p-0"
                    aria-label={`Reveal card ${index() + 1} of ${props.cards.length}`}
                    onClick={() =>
                      setRevealed((current) =>
                        current.map(
                          (value, position) => position === index() || value,
                        ),
                      )
                    }
                  >
                    <CardBack label={`Card ${index() + 1}`} class="w-full" />
                  </Button>
                }
              >
                <GameCard card={card} size="sm" />
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <p class="text-xs text-muted">
          {count()} / {props.cards.length} revealed · each one unique
        </p>
        <Show
          when={allRevealed()}
          fallback={
            <Button onClick={() => setRevealed(props.cards.map(() => true))}>
              Reveal all cards
              <Icon name="spark" size={16} />
            </Button>
          }
        >
          <Button onClick={props.onComplete}>
            Keep all {props.cards.length}
            <Icon name="arrow-right" size={16} />
          </Button>
        </Show>
      </div>
    </WebDialog>
  );
}
