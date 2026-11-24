import { createSignal, onSettled, Show } from "solid-js";
import { Api, ApiError } from "@wikigems/client";
import { Effect } from "effect";
import type { Card } from "@wikigems/domain/domain";
import {
  dollarDecimal,
  formatDollars,
  parseDollars,
  splitPrice,
} from "../../shared/amounts";
import {
  marketError,
  pollSubmitted,
  useOperationRequest,
  useWalletAction,
} from "../lib/market-ui";
import { getSessionUserId } from "../lib/session";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";
import { TextField } from "./ui/form";
import { WalletAccess } from "./WalletAccess";

export function ListingEditor(props: {
  card: Card;
  feeBps: number;
  minPriceUsdcMinor: string;
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
  const [settingUpPayouts, setSettingUpPayouts] = createSignal(false);
  const request = useOperationRequest();
  const userId = getSessionUserId();
  const wallet = useWalletAction(
    (failure) => setError(marketError(failure)),
    userId,
  );
  const minimum = () => formatDollars(props.minPriceUsdcMinor);
  const belowMinimum = (amount: string) =>
    BigInt(amount) < BigInt(props.minPriceUsdcMinor);
  const minor = () => parseDollars(price());
  const quote = () => {
    const amount = minor();
    return amount && !belowMinimum(amount)
      ? splitPrice(BigInt(amount), props.feeBps)
      : null;
  };

  async function save(amount: string | null) {
    if (saving()) return;
    props.onBusy(true);
    setSaving(true);
    setError("");
    const result = await runUi(
      Api.use((api) => {
        const listing = api.setListing(
          props.card.id,
          { priceUsdcMinor: amount },
          userId,
        );
        return listing.pipe(
          Effect.catch((failure) => {
            if (
              amount === null ||
              (failure.code !== "PAYOUT_SETUP_PENDING" &&
                failure.code !== "SELLER_PAYOUT_REQUIRED")
            )
              return Effect.fail(failure);
            return Effect.gen(function* () {
              setSettingUpPayouts(true);
              const checkPayouts = () => api.setupPayouts(userId);
              const payout = yield* pollSubmitted(
                yield* checkPayouts(),
                checkPayouts,
              );
              if (payout.state === "failed")
                return yield* Effect.fail(
                  new ApiError(
                    "Payout setup failed.",
                    409,
                    "PAYOUT_SETUP_FAILED",
                  ),
                );
              setSettingUpPayouts(false);
              return yield* listing;
            });
          }),
        );
      }),
      (failure) => {
        setError(marketError(failure));
        showToast("Could not update the listing", {
          body: marketError(failure),
          tone: "error",
        });
      },
      request,
    );
    setSettingUpPayouts(false);
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
    if (belowMinimum(amount)) {
      setError(`Enter a price of at least ${minimum()}.`);
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
      <p class="text-sm text-muted">Minimum {minimum()}</p>
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
      <Show when={settingUpPayouts()}>
        <p role="status" class="text-sm text-muted">
          Setting up your payouts…
        </p>
      </Show>
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
