import { createMemo, createSignal, For, Show } from "solid-js";
import { Api } from "@wikigems/client";
import type { Card } from "@wikigems/domain/domain";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";
import { GameCard } from "./GameCard";
import { Icon } from "./Icon";
import { Button } from "./ui/button";
import { Spinner } from "./ui/feedback";
import { WebDialog } from "./WebDialog";

export function TradeOfferModal(props: {
  target: Card;
  cards: readonly Card[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const choices = createMemo(() =>
    props.cards.filter((card) => card.status === "claimed"),
  );

  function submit() {
    const offered = selectedId();
    if (!offered) return;
    const target = props.target;
    setBusy(true);
    void runUi(
      Api.use((api) => api.createTradeOffer(offered, target.id)),
      (failure) =>
        showToast("Could not propose that trade", {
          body: failure.message,
          tone: "error",
        }),
    ).then((outcome) => {
      setBusy(false);
      if (!outcome.ok) return;
      showToast("Trade proposed", {
        body: `${target.ownerName ?? "The owner"} can accept or decline from their exchange.`,
        tone: "success",
      });
      props.onSubmitted();
    });
  }

  return (
    <WebDialog onClose={props.onClose} labelId="trade-title" busy={busy()} wide>
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-2">
          <p class="text-xs font-medium text-primary">Propose a trade</p>
          <h2 id="trade-title" class="text-2xl font-semibold">
            What will you offer?
          </h2>
        </div>
        <Button
          iconOnly
          variant="ghost"
          size="sm"
          disabled={busy()}
          onClick={props.onClose}
          aria-label="Close trade dialog"
        >
          <Icon name="close" />
        </Button>
      </div>
      <div class="rounded-xl bg-base-200 p-4">
        <p class="text-xs text-muted">You want</p>
        <h3 class="mt-1 font-semibold">{props.target.title}</h3>
        <p class="mt-1 text-xs text-muted">
          Owned by {props.target.ownerName ?? "another collector"}
        </p>
      </div>
      <Show
        when={choices().length}
        fallback={
          <p class="rounded-xl bg-base-200 p-6 text-sm text-muted">
            Open a pack before proposing a trade.
          </p>
        }
      >
        <p class="text-sm text-muted">Choose a card from your collection.</p>
        <div class="grid grid-cols-1 items-start gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
          <For each={choices()}>
            {(card) => (
              <Button
                variant="ghost"
                disabled={busy()}
                onClick={() => setSelectedId(card.id)}
                data-testid="trade-choice"
                aria-label={`Offer ${card.title}`}
                aria-pressed={selectedId() === card.id ? "true" : "false"}
                class={[
                  "h-auto w-full min-w-0 rounded-2xl p-1 text-left whitespace-normal",
                  selectedId() === card.id
                    ? "ring-2 ring-primary"
                    : "ring-1 ring-base-300",
                ]}
              >
                <GameCard card={card} size="xs" />
              </Button>
            )}
          </For>
        </div>
        <Button
          class="w-full"
          feedback="swap"
          onClick={submit}
          disabled={!selectedId() || busy()}
        >
          <Show
            when={busy()}
            fallback={
              <>
                <Icon name="swap" />
                Send trade offer
              </>
            }
          >
            <Spinner size="sm" />
            Sending…
          </Show>
        </Button>
      </Show>
      <p class="text-xs leading-relaxed text-muted">
        Cards in a wallet can be traded outside the game.
      </p>
    </WebDialog>
  );
}
