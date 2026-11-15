import { HapticButton as Button } from "./HapticButton";
import { useState } from "react";
import type { Card } from "@wikigems/domain/domain";
import { WebDialog } from "./WebDialog";
import { CardBack, GameCard } from "./GameCard";
import { Icon } from "./Icon";

export function PackOpening({
  cards,
  onClose,
  onComplete,
}: {
  cards: Card[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [revealed, setRevealed] = useState(() => cards.map(() => false));
  const allRevealed = revealed.every(Boolean);
  const revealAll = () => setRevealed(cards.map(() => true));
  return (
    <WebDialog onClose={onClose} labelId="pack-title" wide>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-accent">
            A new pack · {cards.length} cards
          </p>
          <h2 id="pack-title" className="text-2xl font-semibold">
            {allRevealed
              ? "A new page in your collection."
              : "A little mystery awaits."}
          </h2>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={onClose}
          aria-label="Close pack"
        >
          <Icon name="close" />
        </Button>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 min-[400px]:grid-cols-2 sm:grid-cols-3">
        {cards.map((card, index) => (
          <div key={card.id}>
            {revealed[index] ? (
              <GameCard card={card} size="sm" />
            ) : (
              <Button
                variant="ghost"
                className="h-auto w-full p-0"
                aria-label={`Reveal card ${index + 1} of ${cards.length}`}
                onPress={() =>
                  setRevealed((current) =>
                    current.map(
                      (value, position) => position === index || value,
                    ),
                  )
                }
              >
                <CardBack label={`Card ${index + 1}`} className="w-full" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted">
          {revealed.filter(Boolean).length} / {cards.length} revealed · each one
          unique
        </p>
        {allRevealed ? (
          <Button onPress={onComplete}>
            Keep all {cards.length}
            <Icon name="arrow-right" size={16} />
          </Button>
        ) : (
          <Button onPress={revealAll}>
            Reveal all cards
            <Icon name="spark" size={16} />
          </Button>
        )}
      </div>
    </WebDialog>
  );
}
