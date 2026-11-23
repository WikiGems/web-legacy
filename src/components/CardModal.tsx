import { createSignal, Show } from "solid-js";
import { Effect } from "effect";
import { Api } from "@wikigems/client";
import type { Card } from "@wikigems/domain/domain";
import {
  explorerAddressUrl,
  explorerTxUrl,
} from "@wikigems/domain/card-engine";
import { haptic } from "../lib/haptics";
import { SOLANA_CLUSTER } from "../lib/solana-wallets";
import { showToast, useWalletState } from "../lib/ui";
import { runUi } from "../runtime";
import { Wallet } from "../services/wallet";
import { CardArtwork } from "./GameCard";
import { Icon } from "./Icon";
import { Button } from "./ui/button";
import { Alert, Chip, Separator, Spinner } from "./ui/feedback";
import { WebDialog } from "./WebDialog";

export function CardModal(props: {
  card: Card;
  owned: boolean;
  linkedWallet: string | null;
  onClose: () => void;
  onChanged: (card: Card) => void;
  onProposeTrade?: (card: Card) => void;
  onOpenWallet: () => void;
}) {
  const wallet = useWalletState();
  const [minting, setMinting] = createSignal(false);
  const [listing, setListing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function mint() {
    const card = props.card;
    if (!props.linkedWallet) {
      props.onOpenWallet();
      return;
    }
    const connected = wallet().wallet;
    if (!connected || connected.address !== props.linkedWallet) {
      showToast("Reconnect your wallet", {
        body: "Your linked wallet needs to be connected to sign the mint.",
        tone: "info",
      });
      props.onOpenWallet();
      return;
    }
    setError(null);
    setMinting(true);
    void runUi(
      Effect.gen(function* () {
        const result = yield* Wallet.use((service) =>
          service.mint(card, connected),
        );
        const updated = yield* Api.use((api) =>
          api.confirmCardMint(card.id, {
            mintAddress: result.mintAddress,
            signature: result.signature,
            walletAddress: connected.address,
          }),
        );
        return { result, updated };
      }),
      (failure) => {
        haptic("error");
        setError(failure.message || "The mint could not be completed.");
      },
    ).then((outcome) => {
      setMinting(false);
      if (!outcome.ok) return;
      const minted = outcome.value;
      props.onChanged(minted.updated);
      showToast("Minted on Solana", {
        body: `${minted.result.mintAddress.slice(0, 4)}…${minted.result.mintAddress.slice(-4)} is now in your wallet.`,
        tone: "success",
      });
    });
  }

  function toggleListing() {
    const card = props.card;
    setListing(true);
    void runUi(
      Api.use((api) => api.toggleCardTrade(card.id, !card.forTrade)),
      (failure) =>
        showToast("Could not update the trade list", {
          body: failure.message,
          tone: "error",
        }),
    ).then((outcome) => {
      setListing(false);
      if (!outcome.ok) return;
      const updated = outcome.value;
      props.onChanged(updated);
      showToast(
        updated.forTrade
          ? "Card is open to trade"
          : "Card removed from the market",
        { tone: "success" },
      );
    });
  }

  async function copyMint() {
    const address = props.card.mintAddress;
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      showToast("Mint address copied", { tone: "success" });
    } catch (cause) {
      showToast("Could not copy the mint address", {
        tone: "error",
        body:
          cause instanceof Error
            ? cause.message
            : "Select the address to copy it manually.",
      });
    }
  }

  return (
    <WebDialog
      onClose={props.onClose}
      labelId="card-title"
      busy={minting() || listing()}
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
          disabled={minting() || listing()}
          aria-label="Close card"
        >
          <Icon name="close" />
        </Button>
      </div>
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
      <Show when={props.card.status === "minted" && props.card.mintAddress}>
        {(mintAddress) => (
          <div class="space-y-3 rounded-xl bg-base-200 p-4">
            <Chip tone="success">On Solana · {SOLANA_CLUSTER}</Chip>
            <Button
              variant="ghost"
              onClick={copyMint}
              aria-label="Copy mint address"
              class="h-auto w-full justify-between whitespace-normal"
            >
              <code class="min-w-0 text-left text-xs break-all">
                {mintAddress()}
              </code>
              <Icon name="copy" size={15} />
            </Button>
            <div class="flex flex-wrap gap-4 text-xs text-primary">
              <a
                href={explorerAddressUrl(mintAddress(), SOLANA_CLUSTER)}
                target="_blank"
                rel="noreferrer"
              >
                View asset ↗
              </a>
              <Show when={props.card.txSignature}>
                {(signature) => (
                  <a
                    href={explorerTxUrl(signature(), SOLANA_CLUSTER)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction ↗
                  </a>
                )}
              </Show>
            </div>
          </div>
        )}
      </Show>
      <Show when={props.owned && props.card.status === "claimed"}>
        <div class="space-y-4">
          <div class="flex flex-wrap gap-3">
            <Button
              feedback="confirm"
              onClick={mint}
              disabled={minting() || listing()}
            >
              <Show
                when={minting()}
                fallback={
                  <>
                    <Icon name="bolt" />
                    {props.linkedWallet
                      ? "Mint NFT on Solana"
                      : "Connect wallet to mint"}
                  </>
                }
              >
                <Spinner size="sm" />
                Minting on Solana…
              </Show>
            </Button>
            <Button
              variant="secondary"
              feedback="sell"
              onClick={toggleListing}
              disabled={listing() || minting()}
            >
              <Show when={listing()}>
                <Spinner size="sm" />
              </Show>
              {props.card.forTrade ? "Listed for trade" : "List for trade"}
            </Button>
          </div>
          <Show when={error()}>
            <Alert status="danger" role="alert">
              {error()}{" "}
              <a
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noreferrer"
                class="underline"
              >
                Get devnet SOL ↗
              </a>
            </Alert>
          </Show>
          <p class="text-xs leading-relaxed text-muted">
            Unminted claims can be traded in-game. Once minted, ownership lives
            in your Solana wallet.
          </p>
        </div>
      </Show>
      <Show when={!props.owned && props.card.forTrade}>
        <Button
          feedback="swap"
          onClick={() => props.onProposeTrade?.(props.card)}
        >
          <Icon name="swap" />
          Propose a trade
        </Button>
      </Show>
      <Separator />
      <p class="text-xs leading-relaxed text-muted">
        Article text from Wikipedia, under CC BY-SA 4.0. Images from Wikimedia
        Commons.
      </p>
    </WebDialog>
  );
}
