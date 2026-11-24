import { createSignal, onSettled, Show } from "solid-js";
import { Api } from "@wikigems/client";
import type { Card } from "@wikigems/domain/domain";
import {
  dollarDecimal,
  formatDollars,
  parseDollars,
  splitPrice,
} from "../../shared/amounts";
import { marketError, useWalletAction } from "../lib/market-ui";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";
import { TextField } from "./ui/form";
import { WalletAccess } from "./WalletAccess";

export function ListingEditor(props: {
  card: Card;
  feeBps: number;
  onChanged: () => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
}) {
  let priceField: HTMLInputElement | undefined;
  onSettled(() => priceField?.focus());
  const [price, setPrice] = createSignal(
    props.card.priceUsdcMinor ? dollarDecimal(props.card.priceUsdcMinor) : "",
  );
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const wallet = useWalletAction((failure) => setError(marketError(failure)));
  const minor = () => parseDollars(price());
  const quote = () => {
    const amount = minor();
    return amount ? splitPrice(BigInt(amount), props.feeBps) : null;
  };

  async function save(amount: string | null) {
    props.onBusy(true);
    setSaving(true);
    setError("");
    const result = await runUi(
      Api.use((api) =>
        api.setListing(props.card.id, { priceUsdcMinor: amount }),
      ),
      (failure) => {
        setError(marketError(failure));
        showToast("Could not update the listing", {
          body: marketError(failure),
          tone: "error",
        });
      },
    );
    setSaving(false);
    props.onBusy(false);
    if (result.ok) {
      showToast(amount ? "Price saved" : "Price cleared", { tone: "success" });
      props.onChanged();
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const amount = minor();
    if (!amount) {
      setError(
        "Enter a price greater than zero with up to 6 decimal places, within the supported range.",
      );
      return;
    }
    setError("");
    void wallet.start(() => void save(amount));
  }

  return (
    <form
      class="space-y-3 rounded-xl bg-base-200 p-4"
      aria-label="Card price"
      onSubmit={submit}
    >
      <TextField
        label="Price in dollars"
        name="price"
        inputmode="decimal"
        autocomplete="off"
        placeholder="1.50"
        value={price()}
        disabled={saving() || wallet.busy() || Boolean(wallet.pending())}
        ref={priceField}
        onChange={(value) => {
          setPrice(value);
          setError("");
        }}
      />
      <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
        <dt class="text-muted">Marketplace fee ({props.feeBps / 100}%)</dt>
        <dd class="text-right">
          {quote() ? formatDollars(quote()?.fee ?? 0n) : "—"}
        </dd>
        <dt>You receive</dt>
        <dd class="text-right font-semibold">
          {quote() ? formatDollars(quote()?.seller ?? 0n) : "—"}
        </dd>
      </dl>
      <Show when={error()}>
        <Alert status="danger" role="alert">
          {error()}
        </Alert>
      </Show>
      <Show
        when={wallet.pending()}
        fallback={
          <div class="flex flex-wrap gap-2">
            <Button
              type="submit"
              pending={saving() || wallet.busy()}
              feedback="sell"
            >
              Save price
            </Button>
            <Show when={props.card.priceUsdcMinor}>
              <Button
                variant="secondary"
                disabled={saving() || wallet.busy()}
                onClick={() => void save(null)}
              >
                Clear price
              </Button>
            </Show>
            <Button
              variant="ghost"
              disabled={saving() || wallet.busy()}
              onClick={props.onCancel}
            >
              Cancel
            </Button>
          </div>
        }
      >
        {(action) => (
          <WalletAccess
            status={action().status}
            onReady={wallet.ready}
            onCancel={wallet.cancel}
            onBusy={(busy) => {
              wallet.setBusy(busy);
              props.onBusy(busy);
            }}
          />
        )}
      </Show>
    </form>
  );
}
