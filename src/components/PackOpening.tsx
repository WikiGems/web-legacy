import { createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { Card } from "../../shared/domain";
import { CardBack, GameCard } from "./GameCard";
import { Icon } from "./Icon";

export function PackOpening(props: {
  cards: Card[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [revealed, setRevealed] = createSignal<boolean[]>(props.cards.map(() => false));
  const allRevealed = () => revealed().every(Boolean);
  const revealCount = () => revealed().filter(Boolean).length;

  function reveal(index: number) {
    if (revealed()[index]) return;
    setRevealed((current) => current.map((value, position) => (position === index ? true : value)));
  }

  function revealAll() {
    setRevealed(props.cards.map(() => true));
  }

  return (
    <Portal>
      <div class="pack-overlay" role="dialog" aria-modal="true" aria-labelledby="pack-title">
        <div class="pack-overlay-head">
          <div>
            <p class="eyebrow">Pack opened · {props.cards.length} cards</p>
            <h2 id="pack-title">
              {allRevealed() ? "A new page in your album." : "Tap each card to reveal."}
            </h2>
          </div>
          <div class="pack-overlay-actions">
            <Show when={!allRevealed()}>
              <button class="btn btn-ghost" onClick={revealAll}>
                Reveal all
              </button>
            </Show>
            <button class="icon-button" onClick={props.onClose} aria-label="Close pack">
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div class="pack-reveal-row">
          <For each={props.cards}>
            {(card, index) => (
              <div
                class="pack-reveal-slot"
                classList={{
                  "is-revealed": revealed()[index()],
                  "is-ready": !revealed()[index()],
                }}
                style={{ "--slot-index": index() }}
                onClick={() => reveal(index())}
                role="button"
                tabindex="0"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") reveal(index());
                }}
                aria-label={
                  revealed()[index()] ? card.title : `Reveal card ${index() + 1} of ${props.cards.length}`
                }
              >
                <Show
                  when={revealed()[index()]}
                  fallback={
                    <>
                      <CardBack size="md" label={`CARD ${index() + 1}`} />
                      <span class="pack-reveal-hint">
                        <Icon name="spark" size={14} /> Tap to reveal
                      </span>
                    </>
                  }
                >
                  <div class="pack-card-reveal">
                    <GameCard card={card} size="md" />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="pack-overlay-foot">
          <p class="mono">
            {revealCount()} / {props.cards.length} revealed · every card is 1 of 1
          </p>
          <Show
            when={allRevealed()}
            fallback={
              <button class="btn btn-primary btn-lg" onClick={revealAll}>
                Reveal all cards <Icon name="spark" size={16} />
              </button>
            }
          >
            <button class="btn btn-primary btn-lg" onClick={props.onComplete}>
              Keep all {props.cards.length} <Icon name="arrow-right" size={16} />
            </button>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
