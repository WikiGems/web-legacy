import { Context, Effect, Layer, SubscriptionRef } from "effect";
import type { Card } from "@wikigems/domain/domain";
import {
  WalletError,
  base64FromBytes,
  installedWallets,
  type WalletDefinition,
} from "../lib/solana-wallets";
import type { BrowserWalletAdapter } from "../lib/solana";
import { getRef } from "../runtime/ref";

export interface ConnectedWallet {
  address: string;
  name: string;
  adapter: BrowserWalletAdapter;
}
export interface WalletState {
  wallet: ConnectedWallet | null;
  connecting: boolean;
  modalOpen: boolean;
}
export type WalletId = WalletDefinition["id"];

const toWalletError = (error: unknown) =>
  error instanceof WalletError
    ? error
    : new WalletError(
        error instanceof Error ? error.message : "The wallet request failed.",
      );

export class Wallet extends Context.Service<
  Wallet,
  {
    readonly state: SubscriptionRef.SubscriptionRef<WalletState>;
    /** Wallets injected by browser extensions, read when asked. */
    readonly options: Effect.Effect<WalletDefinition[]>;
    readonly connect: (
      id: WalletId,
    ) => Effect.Effect<ConnectedWallet, WalletError>;
    readonly disconnect: Effect.Effect<void>;
    readonly signMessage: (
      wallet: ConnectedWallet,
      message: string,
    ) => Effect.Effect<string, WalletError>;
    readonly mint: (
      card: Card,
      wallet: ConnectedWallet,
    ) => Effect.Effect<{ mintAddress: string; signature: string }, WalletError>;
    readonly openModal: Effect.Effect<void>;
    readonly closeModal: Effect.Effect<void>;
  }
>()("wikigems/Wallet") {
  static readonly layer = Layer.effect(
    Wallet,
    Effect.gen(function* () {
      const state = yield* SubscriptionRef.make<WalletState>({
        wallet: null,
        connecting: false,
        modalOpen: false,
      });
      const patch = (change: Partial<WalletState>) =>
        SubscriptionRef.update(state, (current) => ({ ...current, ...change }));

      const connect = (
        id: WalletId,
      ): Effect.Effect<ConnectedWallet, WalletError> =>
        Effect.gen(function* () {
          const definition = installedWallets().find(
            (candidate) => candidate.id === id,
          );
          if (!definition)
            return yield* Effect.fail(
              new WalletError(
                `${id[0]!.toUpperCase()}${id.slice(1)} is not installed. Install the browser wallet and refresh.`,
                "NOT_INSTALLED",
              ),
            );
          yield* patch({ connecting: true });
          return yield* Effect.tryPromise({
            try: async () => {
              // The adapter pulls in Solana libraries; load them on demand.
              const { BrowserWalletAdapter } = await import("../lib/solana");
              const adapter = new BrowserWalletAdapter(
                definition.provider,
                definition.name,
              );
              const publicKey = await adapter.connect();
              return {
                address: publicKey.toBase58(),
                name: definition.name,
                adapter,
              } satisfies ConnectedWallet;
            },
            catch: toWalletError,
          }).pipe(
            Effect.tap((wallet) => patch({ wallet })),
            Effect.ensuring(patch({ connecting: false })),
          );
        });

      return Wallet.of({
        state,
        options: Effect.sync(installedWallets),
        connect,
        disconnect: Effect.gen(function* () {
          const current = getRef(state).wallet;
          if (current)
            yield* Effect.promise(() =>
              current.adapter.disconnect().catch(() => {
                // The wallet may already be disconnected.
              }),
            );
          yield* patch({ wallet: null });
        }),
        signMessage: (wallet, message) =>
          Effect.tryPromise({
            try: async () =>
              base64FromBytes(
                await wallet.adapter.signMessage(
                  new TextEncoder().encode(message),
                ),
              ),
            catch: toWalletError,
          }),
        mint: (card, wallet) =>
          Effect.tryPromise({
            try: async () => {
              const { mintCardNft } = await import("../lib/solana");
              return mintCardNft(card, wallet.adapter);
            },
            catch: toWalletError,
          }),
        openModal: patch({ modalOpen: true }),
        closeModal: patch({ modalOpen: false }),
      });
    }),
  );
}
