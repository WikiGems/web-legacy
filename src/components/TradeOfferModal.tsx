import { createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { Card } from "../../shared/domain";
import { createTradeOffer, runApi } from "../lib/api";
import { showToast } from "../lib/ui";
import { GameCard } from "./GameCard";
import { Icon } from "./Icon";

export function TradeOfferModal(props: {
  target: Card;
  cards: Card[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const choices = () => props.cards.filter((card) => card.status === "claimed");

  async function submit() {
    const offered = selectedId();
    if (!offered) return;
    setBusy(true);
    try {
      await runApi(createTradeOffer(offered, props.target.id));
      showToast("Trade proposed", {
        body: `${props.target.ownerName ?? "The owner"} can accept or decline from their exchange.`,
        tone: "success",
      });
      props.onSubmitted();
    } catch (error) {
      showToast("Could not propose that trade", {
        body: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div
        class="modal-scrim"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div
          class="trade-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trade-title"
        >
          <div class="trade-modal-head">
            <div>
              <p class="eyebrow">Propose a trade</p>
              <h2 id="trade-title">What will you offer?</h2>
            </div>
            <button
              class="icon-button"
              onClick={props.onClose}
              aria-label="Close trade dialog"
            >
              <Icon name="close" />
            </button>
          </div>

          <div class="trade-target">
            <GameCard card={props.target} size="sm" />
            <div>
              <span class="mono">You want</span>
              <h3>{props.target.title}</h3>
              <p>Owned by {props.target.ownerName ?? "another collector"}</p>
            </div>
          </div>

          <Show
            when={choices().length > 0}
            fallback={
              <div class="trade-empty">
                <Icon name="cards" size={28} />
                <p>You need an unminted card to offer. Open a pack first.</p>
              </div>
            }
          >
            <p class="trade-pick-label mono">
              Choose one of your unminted cards
            </p>
            <div class="trade-pick-grid">
              <For each={choices()}>
                {(card) => (
                  <button
                    class="trade-pick"
                    classList={{ "is-selected": selectedId() === card.id }}
                    onClick={() => setSelectedId(card.id)}
                  >
                    <GameCard card={card} size="xs" />
                    <Show when={selectedId() === card.id}>
                      <span class="trade-pick-check">
                        <Icon name="check" size={14} />
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <button
              class="btn btn-primary btn-lg btn-full"
              onClick={submit}
              disabled={!selectedId() || busy()}
            >
              <Show
                when={busy()}
                fallback={
                  <>
                    <Icon name="swap" size={17} /> Send trade offer
                  </>
                }
              >
                <span class="spinner" /> Sending…
              </Show>
            </button>
          </Show>
          <p class="trade-fine">
            In-game trades swap unminted 1-of-1 claims. Once a card is minted,
            ownership lives in the Solana wallet instead.
          </p>
        </div>
      </div>
    </Portal>
  );
}
