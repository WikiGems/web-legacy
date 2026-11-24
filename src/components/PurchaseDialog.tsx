import { createSignal, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { Api, ApiError } from "@wikigems/client";
import type { Listing } from "@wikigems/domain/domain";
import { Effect } from "effect";
import { formatDollars } from "../../shared/amounts";
import {
  marketError,
  pollSubmitted,
  requireBalance,
  signPrepared,
  submitOperation,
  useOperationRequest,
  useWalletAction,
} from "../lib/market-ui";
import type { WalletError } from "../lib/wallet/error";
import { getSessionUserId } from "../lib/session";
import { showToast } from "../lib/ui";
import { runUi } from "../runtime";
import { PaymentRefund } from "./PaymentRefund";
import { CardArtwork } from "./GameCard";
import { WalletAccess } from "./WalletAccess";
import { WebDialog } from "./WebDialog";
import { Button, buttonClass } from "./ui/button";
import { Alert } from "./ui/feedback";

export function PurchaseDialog(props: {
  listing: Listing;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [listing, setListing] = createSignal(props.listing);
  const [error, setError] = createSignal<ApiError | WalletError | null>(null);
  const [priceNotice, setPriceNotice] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [checkingPayment, setCheckingPayment] = createSignal(false);
  const [refundReference, setRefundReference] = createSignal<string | null>(
    null,
  );
  const request = useOperationRequest();
  const userId = getSessionUserId();
  const wallet = useWalletAction(fail, userId);
  const price = () => formatDollars(listing().priceUsdcMinor);
  function fail(failure: ApiError | WalletError) {
    setError(failure);
    showToast("Could not buy the card", {
      body: marketError(failure),
      tone: "error",
    });
  }

  async function buy(address: string) {
    const { id, card, priceUsdcMinor } = listing();
    setBusy(true);
    const outcome = await runUi(
      Api.use((api) =>
        Effect.gen(function* () {
          const order = yield* api
            .preparePurchase(
              {
                listingId: id,
                expectedPriceUsdcMinor: priceUsdcMinor,
              },
              userId,
            )
            .pipe(
              Effect.catch((failure) =>
                failure.code === "PRICE_CHANGED"
                  ? Effect.flatMap(api.fetchMarket(), (market) => {
                      const replacement = market.listings.find(
                        (item) => item.id === id,
                      );
                      if (!replacement)
                        return Effect.fail(
                          new ApiError(
                            "This listing is no longer available.",
                            409,
                            "LISTING_UNAVAILABLE",
                          ),
                        );
                      setListing(replacement);
                      setPriceNotice(true);
                      props.onChanged();
                      return Effect.succeed(null);
                    })
                  : Effect.fail(failure),
              ),
            );
          if (!order) return null;
          const prepared = order.transaction;
          const reconcile = () => api.purchaseStatus(order.id, userId);
          let current = order;
          if (order.state === "prepared" && prepared) {
            yield* requireBalance(order.priceUsdcMinor, address);
            const signed = yield* signPrepared(
              prepared,
              `Buy the ${card.title} card for ${formatDollars(order.priceUsdcMinor)}`,
            );
            current = yield* submitOperation(
              api.purchaseStatus(order.id, userId, signed),
              reconcile(),
            );
          }
          setCheckingPayment(current.state === "submitted");
          return yield* pollSubmitted(current, reconcile);
        }),
      ),
      fail,
      request,
    );
    setBusy(false);
    setCheckingPayment(false);
    if (!outcome.ok || !outcome.value) return;
    const order = outcome.value;
    if (order.state === "settled") {
      props.onChanged();
      showToast("Card added to your collection", {
        body: card.title,
        tone: "success",
      });
      props.onClose();
    } else if (order.state === "refund_required") {
      setRefundReference(order.id);
      props.onChanged();
    } else {
      fail(
        new ApiError(
          "Payment could not be completed. Try again.",
          409,
          order.failureCode ?? undefined,
        ),
      );
    }
  }

  return (
    <WebDialog
      labelId="purchase-title"
      onClose={props.onClose}
      busy={busy() || wallet.busy()}
    >
      <div class="space-y-2">
        <h2 id="purchase-title" class="text-2xl font-semibold">
          Buy {listing().card.title}
        </h2>
        <p class="text-sm text-muted">
          This card goes into your collection after payment.
        </p>
      </div>
      <CardArtwork card={listing().card} class="h-48 w-full" />
      <div class="flex items-center justify-between gap-3 rounded-xl bg-base-200 p-4">
        <span>Total</span>
        <strong class="tabular-nums">{price()}</strong>
      </div>
      <Show when={refundReference()}>
        {(id) => <PaymentRefund reference={id()} />}
      </Show>
      <Show when={priceNotice()}>
        <p role="status" class="text-sm">
          The price changed. Review the new total before buying.
        </p>
      </Show>
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
        <p role="status" class="text-sm text-muted">
          {checkingPayment()
            ? "Waiting for payment confirmation…"
            : "Preparing your purchase…"}
        </p>
      </Show>
      <Show
        when={wallet.pending()}
        fallback={
          <div class="flex flex-wrap gap-2">
            <Show when={!refundReference()}>
              <Button
                pending={busy() || wallet.busy()}
                disabled={error()?.code === "LISTING_UNAVAILABLE"}
                feedback="buy"
                onClick={() => {
                  setError(null);
                  setPriceNotice(false);
                  void wallet.start((address) => void buy(address), true);
                }}
              >
                {error()?.code === "TRANSACTION_EXPIRED"
                  ? "Try again"
                  : `Buy for ${price()}`}
              </Button>
            </Show>
            <Button
              variant="ghost"
              disabled={busy() || wallet.busy()}
              onClick={props.onClose}
            >
              {refundReference() ? "Close" : "Cancel"}
            </Button>
          </div>
        }
      >
        {(action) => (
          <WalletAccess
            status={action().status}
            onReady={wallet.ready}
            onCancel={wallet.cancel}
            onBusy={wallet.setBusy}
          />
        )}
      </Show>
    </WebDialog>
  );
}
