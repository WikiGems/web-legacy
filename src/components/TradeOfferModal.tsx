import { WebDialog } from "./WebDialog";
import { Spinner } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { useState } from "react";
import type { Card } from "@wikigems/domain/domain";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choices = props.cards.filter((card) => card.status === "claimed");
  async function submit() {
    const offered = selectedId;
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
    <WebDialog onClose={props.onClose} labelId="trade-title" busy={busy} wide>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-accent">Propose a trade</p>
          <h2 id="trade-title" className="text-2xl font-semibold">
            What will you offer?
          </h2>
        </div>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onPress={props.onClose}
          aria-label="Close trade dialog"
        >
          <Icon name="close" />
        </Button>
      </div>
      <div className="rounded-xl bg-default/50 p-4">
        <p className="text-xs text-muted">You want</p>
        <h3 className="mt-1 font-semibold">{props.target.title}</h3>
        <p className="mt-1 text-xs text-muted">
          Owned by {props.target.ownerName ?? "another collector"}
        </p>
      </div>
      {choices.length ? (
        <>
          <p className="text-sm text-muted">
            Choose one of your unminted cards.
          </p>
          <div className="grid grid-cols-1 items-start gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
            {choices.map((card) => (
              <Button
                key={card.id}
                variant="ghost"
                isDisabled={busy}
                onPress={() => setSelectedId(card.id)}
                data-testid="trade-choice"
                aria-label={`Offer ${card.title}`}
                aria-pressed={selectedId === card.id}
                className={`h-auto w-full min-w-0 rounded-2xl p-1 text-left whitespace-normal ${selectedId === card.id ? "ring-2 ring-accent" : "ring-1 ring-separator"}`}
              >
                <GameCard card={card} size="xs" />
              </Button>
            ))}
          </div>
          <Button
            className="w-full"
            feedback="swap"
            onPress={submit}
            isDisabled={!selectedId || busy}
          >
            {busy ? (
              <>
                <Spinner size="sm" />
                Sending…
              </>
            ) : (
              <>
                <Icon name="swap" />
                Send trade offer
              </>
            )}
          </Button>
        </>
      ) : (
        <p className="rounded-xl bg-default/50 p-6 text-sm text-muted">
          You need an unminted card to offer. Open a pack first.
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">
        Trades exchange unminted in-game claims. Minted cards belong to their
        Solana wallet.
      </p>
    </WebDialog>
  );
}
