import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";
import {
  encodeBase64,
  type WalletVaultStatus,
} from "../../shared/wallet-vault";
import {
  WalletError,
  installedWallets,
  type WalletDefinition,
} from "../lib/solana-wallets";
import type { BrowserWalletAdapter } from "../lib/solana";
import { walletVaultApi } from "../lib/wallet/api";
import { createWalletCore } from "../lib/wallet/core";
import { browserPasskeys } from "../lib/wallet/passkey";
import { getRef, updateRef } from "../runtime/ref";
import { Auth } from "./auth";

export interface TransactionWalletSigner {
  address: string;
  signMessageBytes: (bytes: Uint8Array) => Promise<Uint8Array>;
}

interface WalletSigner {
  address: string;
  name: string;
  /** Supply the payment or claim description for transaction message bytes. */
  signMessageBytes: (
    bytes: Uint8Array,
    confirmation?: string,
  ) => Promise<Uint8Array>;
}

interface ExternalWallet extends WalletSigner {
  kind: "external";
  adapter: BrowserWalletAdapter;
}

interface EmbeddedWallet extends WalletSigner {
  kind: "embedded";
}

export type ConnectedWallet = ExternalWallet | EmbeddedWallet;

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

const walletEffect = <T>(run: (signal: AbortSignal) => Promise<T>) =>
  Effect.tryPromise({ try: run, catch: toWalletError });

const hiddenLockMs = 60_000;

export class Wallet extends Context.Service<
  Wallet,
  {
    readonly state: SubscriptionRef.SubscriptionRef<WalletState>;
    /** Wallets injected by browser extensions, read when asked. */
    readonly options: Effect.Effect<WalletDefinition[]>;
    readonly connect: (
      id: WalletId,
    ) => Effect.Effect<ExternalWallet, WalletError>;
    readonly disconnect: Effect.Effect<void>;
    readonly signMessage: (
      wallet: ExternalWallet,
      message: string,
    ) => Effect.Effect<string, WalletError>;
    readonly transactionSigner: (
      confirmation: string,
    ) => Effect.Effect<TransactionWalletSigner, WalletError>;
    readonly embeddedStatus: Effect.Effect<WalletVaultStatus, WalletError>;
    readonly createEmbedded: (options?: {
      replaceExternalAddress?: string;
    }) => Effect.Effect<EmbeddedWallet, WalletError>;
    readonly unlockEmbedded: Effect.Effect<EmbeddedWallet, WalletError>;
    readonly lockEmbedded: Effect.Effect<void>;
    readonly addEmbeddedPasskey: Effect.Effect<void, WalletError>;
    readonly removeEmbeddedPasskey: (
      credentialId: string,
    ) => Effect.Effect<void, WalletError>;
    readonly exportEmbedded: Effect.Effect<string, WalletError>;
    readonly confirmEmbeddedExport: Effect.Effect<void, WalletError>;
    readonly openModal: Effect.Effect<void>;
    readonly closeModal: Effect.Effect<void>;
  }
>()("wikigems/Wallet") {
  static readonly layer = Layer.effect(
    Wallet,
    Effect.gen(function* () {
      const auth = yield* Auth;
      const state = yield* SubscriptionRef.make<WalletState>({
        wallet: null,
        connecting: false,
        modalOpen: false,
      });
      const patch = (change: Partial<WalletState>) =>
        SubscriptionRef.update(state, (current) => ({ ...current, ...change }));

      const core = createWalletCore({
        vault: walletVaultApi,
        passkeys: browserPasskeys,
        confirm: (text) => window.confirm(text),
      });
      const session = () => {
        const current = getRef(auth.session).data;
        if (!current) throw new WalletError("Sign in to use your wallet.");
        return current;
      };
      const account = () => {
        const { user } = session();
        return { userId: user.id, accountName: user.email };
      };

      const lock = () => {
        core.request({ kind: "lock" });
        updateRef(state, (current) =>
          current.wallet?.kind === "embedded"
            ? { ...current, wallet: null }
            : current,
        );
      };
      let hiddenAt: number | null = null;
      let lockTimer: ReturnType<typeof setTimeout> | undefined;
      const onVisibilityChange = () => {
        clearTimeout(lockTimer);
        if (document.hidden) {
          hiddenAt = Date.now();
          lockTimer = setTimeout(lock, hiddenLockMs);
        } else {
          if (hiddenAt !== null && Date.now() - hiddenAt >= hiddenLockMs)
            lock();
          hiddenAt = null;
        }
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          document.addEventListener("visibilitychange", onVisibilityChange);
          window.addEventListener("pagehide", lock);
          onVisibilityChange();
        }),
        () =>
          Effect.sync(() => {
            clearTimeout(lockTimer);
            document.removeEventListener(
              "visibilitychange",
              onVisibilityChange,
            );
            window.removeEventListener("pagehide", lock);
            lock();
          }),
      );

      let activeToken = getRef(auth.session).data?.session.token;
      yield* Stream.runForEach(
        SubscriptionRef.changes(auth.session),
        ({ data }) =>
          Effect.sync(() => {
            const next = data?.session.token;
            if (next !== activeToken) {
              activeToken = next;
              lock();
              updateRef(state, (current) => ({ ...current, wallet: null }));
            }
          }),
      ).pipe(Effect.forkScoped);

      const connectedEmbedded = (address: string): EmbeddedWallet => {
        const {
          user,
          session: { token },
        } = session();
        return {
          kind: "embedded",
          address,
          name: "WikiGems wallet",
          signMessageBytes: async (bytes, confirmation = "") => {
            if (hiddenAt !== null && Date.now() - hiddenAt >= hiddenLockMs)
              lock();
            const signer = session();
            if (signer.session.token !== token)
              throw new WalletError(
                "Your active account changed. Unlock your wallet again.",
              );
            return core.request({
              kind: "sign",
              address,
              userId: user.id,
              bytes,
              confirmation,
            });
          },
        };
      };

      const useEmbedded = (open: () => Promise<string>) =>
        walletEffect(async () => {
          const {
            session: { token },
          } = session();
          const address = await open();
          if (getRef(auth.session).data?.session.token !== token) {
            lock();
            throw new WalletError(
              "Your active account changed. Open Wallet again.",
            );
          }
          return connectedEmbedded(address);
        }).pipe(Effect.tap((wallet) => patch({ wallet })));

      const connect = (
        id: WalletId,
      ): Effect.Effect<ExternalWallet, WalletError> =>
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
          const token = getRef(auth.session).data?.session.token;
          return yield* walletEffect(async () => {
            // The adapter pulls in Solana libraries; load them on demand.
            const { BrowserWalletAdapter } = await import("../lib/solana");
            const adapter = new BrowserWalletAdapter(
              definition.provider,
              definition.name,
            );
            const publicKey = await adapter.connect();
            if (getRef(auth.session).data?.session.token !== token)
              throw new WalletError(
                "Your active account changed. Connect your wallet again.",
              );
            lock();
            return {
              kind: "external",
              address: publicKey.toBase58(),
              name: definition.name,
              adapter,
              signMessageBytes: async (bytes, confirmation) => {
                if (getRef(auth.session).data?.session.token !== token)
                  throw new WalletError(
                    "Your active account changed. Connect your wallet again.",
                  );
                return confirmation
                  ? adapter.signTransactionMessage(Uint8Array.from(bytes))
                  : adapter.signMessage(bytes);
              },
            } satisfies ExternalWallet;
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
          lock();
          if (current?.kind === "external")
            yield* Effect.promise(() =>
              current.adapter.disconnect().catch(() => {
                // The wallet may already be disconnected.
              }),
            );
          yield* patch({ wallet: null });
        }),
        signMessage: (wallet, message) =>
          walletEffect(async () =>
            encodeBase64(
              await wallet.signMessageBytes(new TextEncoder().encode(message)),
            ),
          ),
        transactionSigner: (confirmation) =>
          Effect.gen(function* () {
            const { wallet } = getRef(state);
            if (!wallet)
              return yield* Effect.fail(
                new WalletError("Connect or unlock your wallet to continue."),
              );
            if (!confirmation.trim())
              return yield* Effect.fail(
                new WalletError(
                  "A description of the wallet action is required.",
                ),
              );
            return {
              address: wallet.address,
              signMessageBytes: (bytes: Uint8Array) =>
                wallet.signMessageBytes(bytes, confirmation),
            };
          }),
        embeddedStatus: walletEffect((signal) =>
          walletVaultApi.read(account().userId, signal),
        ),
        createEmbedded: (options) =>
          useEmbedded(() =>
            core.request({ kind: "create", ...account(), ...options }),
          ),
        unlockEmbedded: useEmbedded(() =>
          core.request({ kind: "unlock", userId: account().userId }),
        ),
        lockEmbedded: Effect.sync(lock),
        addEmbeddedPasskey: walletEffect(() =>
          core.request({ kind: "add-wrapper", ...account() }),
        ),
        removeEmbeddedPasskey: (credentialId) =>
          walletEffect(() =>
            core.request({
              kind: "remove-wrapper",
              userId: account().userId,
              credentialId,
            }),
          ).pipe(Effect.tap(() => Effect.sync(lock))),
        exportEmbedded: walletEffect(() =>
          core.request({ kind: "export", userId: account().userId }),
        ),
        confirmEmbeddedExport: walletEffect(() =>
          core.request({ kind: "confirm-export", userId: account().userId }),
        ),
        openModal: patch({ modalOpen: true }),
        closeModal: patch({ modalOpen: false }),
      });
    }),
  );
}
