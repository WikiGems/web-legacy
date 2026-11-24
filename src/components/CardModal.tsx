import { createSignal, Show } from "solid-js";
import { Api } from "@wikigems/client";
import type { Card, MarketConfigSchema } from "@wikigems/domain/domain";
import { explorerAddressUrl } from "@wikigems/domain/card-engine";
import { formatDollars } from "../../shared/amounts";
import { marketError } from "../lib/market-ui";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";
import { CardArtwork } from "./GameCard";
import { ClaimEditor } from "./ClaimEditor";
import { Icon } from "./Icon";
import { ListingEditor } from "./ListingEditor";
import { Button } from "./ui/button";
import { Chip, Separator } from "./ui/feedback";
import { WebDialog } from "./WebDialog";

export function CardModal(props: {
  card: Card;
  config: typeof MarketConfigSchema.Type;
  linkedWallet: string | null;
  onClose: () => void;
  onChanged: () => void;
  initialAction?: "price";
}) {
  const [busy, setBusy] = createSignal(false);
  const [action, setAction] = createSignal<"price" | "claim" | null>(
    props.initialAction ?? null,
  );
  const [trading, setTrading] = createSignal(false);
  const busyDialog = () => busy() || trading();
  const quote = () =>
    props.config.freeClaimsRemaining > 0
      ? "0"
      : props.config.claimPriceUsdcMinor;

  function changed() {
    setAction(null);
    props.onChanged();
  }

  async function toggleTrade() {
    setTrading(true);
    const result = await runUi(
      Api.use((api) =>
        api.toggleCardTrade(props.card.id, !props.card.forTrade),
      ),
      (failure) =>
        showToast("Could not update the trade list", {
          body: marketError(failure),
          tone: "error",
        }),
    );
    setTrading(false);
    if (result.ok) {
      showToast(
        result.value.forTrade
          ? "Card is open to trade"
          : "Card is closed to trades",
        { tone: "success" },
      );
      props.onChanged();
    }
  }

  return (
    <WebDialog
      onClose={props.onClose}
      labelId="card-title"
      busy={busyDialog()}
      wide
    >
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2">
          <p class="text-xs font-medium text-primary">{props.card.category}</p>
          <h2 id="card-title" class="text-2xl font-semibold tracking-tight">
            {props.card.title}
          </h2>
        </div>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          onClick={props.onClose}
          disabled={busyDialog()}
          aria-label="Close card"
        >
          <Icon name="close" />
        </Button>
      </div>
      <Show when={props.card.status === "claimed"}>
        <div class="space-y-3">
          <Show when={action() === null}>
            <div class="flex flex-wrap gap-2">
              <Button
                feedback="confirm"
                disabled={busyDialog()}
                onClick={() => setAction("claim")}
              >
                Own this card
              </Button>
              <Button
                variant="secondary"
                class="h-auto whitespace-normal"
                feedback="sell"
                disabled={busyDialog()}
                onClick={() => setAction("price")}
              >
                {props.card.priceUsdcMinor
                  ? `Edit price · ${formatDollars(props.card.priceUsdcMinor)}`
                  : "Set a price"}
              </Button>
              <Button
                variant="secondary"
                feedback="swap"
                pending={trading()}
                disabled={busyDialog()}
                aria-pressed={props.card.forTrade ? "true" : "false"}
                onClick={() => void toggleTrade()}
              >
                {props.card.forTrade ? "Remove from trades" : "List for trade"}
              </Button>
            </div>
          </Show>
          <Show when={action() === "price"}>
            <ListingEditor
              card={props.card}
              feeBps={props.config.marketFeeBps}
              onChanged={changed}
              onBusy={setBusy}
              onCancel={() => setAction(null)}
            />
          </Show>
          <Show when={action() === "claim"}>
            <ClaimEditor
              card={props.card}
              linkedWallet={props.linkedWallet}
              quotedPrice={quote()}
              onChanged={changed}
              onBusy={setBusy}
              onCancel={() => setAction(null)}
            />
          </Show>
        </div>
      </Show>
      <Show when={props.card.status === "minted"}>
        <div class="space-y-3 rounded-xl bg-base-200 p-4">
          <Chip tone="success">In a wallet</Chip>
          <details>
            <summary class="cursor-pointer text-sm font-medium">
              Advanced details
            </summary>
            <Show when={props.card.ownerWallet}>
              {(address) => (
                <p class="mt-2 text-sm">
                  Wallet{" "}
                  <code title={address()}>
                    {address().slice(0, 6)}…{address().slice(-4)}
                  </code>
                </p>
              )}
            </Show>
            <Show when={props.card.mintAddress}>
              {(asset) => (
                <a
                  class="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  href={explorerAddressUrl(
                    encodeURIComponent(asset()),
                    encodeURIComponent(props.config.cluster),
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  View in explorer <Icon name="external" size={14} />
                </a>
              )}
            </Show>
          </details>
        </div>
      </Show>
      <CardArtwork card={props.card} class="max-h-72" />
      <div class="space-y-4">
        <p class="font-medium">{props.card.description}</p>
        <p class="text-sm leading-relaxed text-muted">{props.card.extract}</p>
        <a
          href={props.card.articleUrl}
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Read the Wikipedia article
          <Icon name="external" size={14} />
        </a>
      </div>
      <Separator />
      <p class="text-xs leading-relaxed text-muted">
        Article text from Wikipedia, under CC BY-SA 4.0. Images from Wikimedia
        Commons.
      </p>
    </WebDialog>
  );
}
