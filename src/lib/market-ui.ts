import { createSignal, onCleanup } from "solid-js";
import { Api, ApiError } from "@wikigems/client";
import { Effect } from "effect";
import type {
  ChainOperationState,
  PreparedMessage,
} from "@wikigems/domain/domain";
import {
  encodeBase64,
  type WalletVaultStatus,
} from "../../shared/wallet-vault";
import { getService, runUi } from "../runtime";
import { Wallet } from "../services/wallet";
import { useWalletState } from "./ui";
import { WalletError } from "./wallet/error";

export function marketError(error: ApiError | WalletError) {
  switch (error.code) {
    case "CARD_LOCKED":
      return "This card is reserved for another action. Try again in a moment.";
    case "TRADE_PENDING":
      return "This card is part of a pending trade.";
    case "WALLET_REQUIRED":
      return "Set up your wallet to continue.";
    case "SELLER_WALLET_REQUIRED":
      return "The seller needs to reconnect their wallet.";
    case "INSUFFICIENT_DOLLARS":
    case "INSUFFICIENT_FUNDS":
      return "You need more dollars in your wallet.";
    case "TRANSACTION_EXPIRED":
      return "The request expired. You can try again.";
    case "TRANSACTION_FAILED":
      return "The request failed. You can try again.";
    case "CHAIN_UNAVAILABLE":
    case "CHAIN_NOT_CONFIGURED":
    case "CHAIN_MISMATCH":
      return "Wallet payments are temporarily unavailable. Try again later.";
    case "INVALID_PRICE":
      return "Enter a positive price with up to 6 decimal places.";
    case "INVALID_DESTINATION":
      return "Enter a valid wallet address.";
    case "CARD_MINTED":
      return "This card is already in a wallet.";
    default:
      return error.message;
  }
}

export function useWalletAction(onFailure: (error: WalletError) => void) {
  const state = useWalletState();
  const request = useOperationRequest();
  const [pending, setPending] = createSignal<{
    status: WalletVaultStatus;
    run: (address: string) => void;
  } | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  async function start(run: (address: string) => void, needsSigner = false) {
    if (checking() || busy() || pending()) return;
    setChecking(true);
    const result = await runUi(
      getService(Wallet).embeddedStatus,
      onFailure,
      request,
    );
    setChecking(false);
    if (!result.ok || request.signal.aborted) return;
    const { walletAddress } = result.value;
    if (
      walletAddress &&
      (!needsSigner || state().wallet?.address === walletAddress)
    )
      run(walletAddress);
    else setPending({ status: result.value, run });
  }

  return {
    pending,
    busy: () => checking() || busy(),
    setBusy,
    start,
    cancel: () => setPending(null),
    ready(address: string) {
      if (request.signal.aborted) return;
      const action = pending();
      setPending(null);
      action?.run(address);
    },
  };
}

export const requireBalance = (price: string, address: string) =>
  Effect.gen(function* () {
    const balance = yield* Api.use((api) => api.fetchWalletBalance());
    if (balance.walletAddress !== address)
      return yield* Effect.fail(
        new ApiError("Your wallet changed. Try again.", 409, "WALLET_REQUIRED"),
      );
    if (BigInt(balance.balanceUsdcMinor) < BigInt(price))
      return yield* Effect.fail(
        new ApiError(
          "You need more dollars in your wallet.",
          409,
          "INSUFFICIENT_DOLLARS",
        ),
      );
  });

export const signPrepared = (prepared: PreparedMessage, confirmation: string) =>
  Effect.gen(function* () {
    const signer = yield* Wallet.use((wallet) =>
      wallet.transactionSigner(confirmation),
    );
    if (
      signer.address !== prepared.signerAddress ||
      !prepared.requiredSigners.includes(signer.address)
    )
      return yield* Effect.fail(
        new WalletError("Connect the wallet linked to this account."),
      );
    return yield* Effect.tryPromise({
      try: async () => {
        const bytes = Uint8Array.fromBase64(prepared.message);
        const signature = await signer.signMessageBytes(bytes);
        if (signature.length !== 64)
          throw new WalletError("Your wallet returned an invalid signature.");
        return { signature: encodeBase64(signature) };
      },
      catch: (error) =>
        error instanceof WalletError
          ? error
          : new WalletError("Payment approval was interrupted. Try again."),
    });
  });

export function useOperationRequest() {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  return { signal: controller.signal };
}

export function pollOperation<
  A extends { state: ChainOperationState; id: string },
>(initial: A, read: (id: string) => Effect.Effect<A, ApiError>) {
  return Effect.gen(function* () {
    let current = initial;
    let delay = 500;
    while (current.state === "submitted") {
      yield* Effect.sleep(delay);
      delay = Math.min(delay * 2, 8_000);
      current = yield* read(current.id).pipe(
        Effect.catch((error) =>
          error.status === 0 || error.status >= 500
            ? Effect.succeed(current)
            : Effect.fail(error),
        ),
      );
    }
    return current;
  });
}

export function submitOperation<A extends { state: ChainOperationState }>(
  submit: Effect.Effect<A, ApiError>,
  read: Effect.Effect<A, ApiError>,
) {
  return submit.pipe(
    Effect.catch((error) => {
      if (error.status !== 0 && error.status < 500) return Effect.fail(error);
      return read.pipe(
        Effect.flatMap((current) =>
          current.state === "prepared"
            ? Effect.fail(error)
            : Effect.succeed(current),
        ),
      );
    }),
  );
}
