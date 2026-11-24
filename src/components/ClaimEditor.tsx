import { createSignal, onSettled, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { Api, ApiError } from "@wikigems/client";
import type { Card } from "@wikigems/domain/domain";
import { Effect } from "effect";
import bs58 from "bs58";
import { formatDollars } from "../../shared/amounts";
import {
  marketError,
  pollOperation,
  requireBalance,
  signPrepared,
  submitOperation,
  useOperationRequest,
  useWalletAction,
} from "../lib/market-ui";
import type { WalletError } from "../lib/wallet/error";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";
import { WalletAccess } from "./WalletAccess";
import { Button, buttonClass } from "./ui/button";
import { Alert } from "./ui/feedback";
import { TextField } from "./ui/form";

export function ClaimEditor(props: {
  card: Card;
  quotedPrice: string;
  linkedWallet: string | null;
  onChanged: () => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
}) {
  let panel: HTMLElement | undefined;
  onSettled(() => panel?.focus());
  const [destination, setDestination] = createSignal("");
  const [approvedPrice, setApprovedPrice] = createSignal(props.quotedPrice);
  const [priceChanged, setPriceChanged] = createSignal(false);
  const [error, setError] = createSignal<ApiError | WalletError | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [waiting, setWaiting] = createSignal(false);
  const wallet = useWalletAction(fail);
  const request = useOperationRequest();
  const target = () => destination().trim();
  const price = () =>
    approvedPrice() === "0" ? "Free" : formatDollars(approvedPrice());

  function fail(failure: ApiError | WalletError) {
    setError(failure);
    showToast("Could not move the card", {
      body: marketError(failure),
      tone: "error",
    });
  }

  async function claim(address: string, selectedDestination: string) {
    const quoted = approvedPrice();
    const card = props.card;
    setBusy(true);
    props.onBusy(true);
    setError(null);
    const result = await runUi(
      Api.use((api) =>
        Effect.gen(function* () {
          if (quoted !== "0") yield* requireBalance(quoted, address);
          const order = yield* api.prepareClaim(
            card.id,
            selectedDestination ? { destination: selectedDestination } : {},
          );
          const prepared = order.transaction;
          let current = order;
          if (order.state === "prepared" && prepared) {
            if (order.priceUsdcMinor !== quoted) {
              setApprovedPrice(order.priceUsdcMinor);
              setPriceChanged(true);
              return null;
            }
            const signed = yield* signPrepared(
              prepared,
              `Move the ${card.title} card to a wallet for ${formatDollars(order.priceUsdcMinor)}`,
            );
            current = yield* submitOperation(
              api.claimStatus(order.id, signed),
              api.claimStatus(order.id),
            );
          }
          setWaiting(current.state === "submitted");
          return yield* pollOperation(current, api.claimStatus);
        }),
      ),
      fail,
      request,
    );
    setBusy(false);
    setWaiting(false);
    props.onBusy(false);
    if (!result.ok || !result.value) return;
    const completed = result.value;
    if (completed.state === "settled") {
      showToast("Card moved to a wallet", {
        body: card.title,
        tone: "success",
      });
      props.onChanged();
    } else {
      fail(
        new ApiError(
          "The card could not be moved. Try again.",
          409,
          completed.failureCode ?? undefined,
        ),
      );
    }
  }

  function begin() {
    const value = target();
    setError(null);
    if (
      value &&
      (value.length > 44 || bs58.decodeUnsafe(value)?.length !== 32)
    ) {
      setError(
        new ApiError(
          "Enter a valid wallet address.",
          400,
          "INVALID_DESTINATION",
        ),
      );
      return;
    }
    setPriceChanged(false);
    props.onBusy(true);
    void wallet
      .start((address) => void claim(address, value), approvedPrice() !== "0")
      .finally(() => {
        if (!busy()) props.onBusy(false);
      });
  }

  return (
    <section
      class="space-y-4 rounded-xl bg-base-200 p-4"
      aria-label="Move card to a wallet"
      ref={panel}
      tabindex="-1"
    >
      <p class="text-sm text-muted">
        Move this card to your wallet so you can keep or trade it anywhere.
      </p>
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm">Total</span>
        <strong class="tabular-nums">{price()}</strong>
      </div>
      <Show when={priceChanged()}>
        <p role="status" class="text-sm">
          The price changed. Review the new total before moving your card.
        </p>
      </Show>
      <details>
        <summary class="cursor-pointer text-sm font-medium">Advanced</summary>
        <div class="mt-3 space-y-2">
          <TextField
            label="Destination wallet address"
            placeholder={props.linkedWallet ?? "Your wallet"}
            name="destination"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            value={destination()}
            onChange={setDestination}
            disabled={busy() || wallet.busy() || Boolean(wallet.pending())}
          />
          <p class="text-xs text-muted">
            Leave this blank to use your wallet. If you enter another address,
            your card moves there and may leave this collection.
          </p>
        </div>
      </details>
      <Show when={error()}>
        {(failure) => (
          <div class="space-y-3">
            <Alert status="danger" role="alert">
              {marketError(failure())}
            </Alert>
            <Show
              when={["INSUFFICIENT_DOLLARS", "INSUFFICIENT_FUNDS"].includes(
                failure().code ?? "",
              )}
            >
              <Link
                class={buttonClass("secondary")}
                to="/wallet"
                hash="add-dollars"
              >
                Add dollars
              </Link>
            </Show>
          </div>
        )}
      </Show>
      <Show when={busy()}>
        <p class="text-sm text-muted" role="status">
          {waiting() ? "Waiting for confirmation…" : "Preparing your card…"}
        </p>
      </Show>
      <Show
        when={wallet.pending()}
        fallback={
          <div class="flex flex-wrap gap-2">
            <Button
              feedback="confirm"
              pending={busy() || wallet.busy()}
              onClick={begin}
            >
              {error()?.code === "TRANSACTION_EXPIRED"
                ? "Try again"
                : "Move to wallet"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy() || wallet.busy()}
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
            onBusy={(pending) => {
              wallet.setBusy(pending);
              props.onBusy(pending);
            }}
          />
        )}
      </Show>
    </section>
  );
}
