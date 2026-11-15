import { haptic } from "../lib/haptics";
import { WebDialog } from "./WebDialog";
import { Alert, Chip, Separator, Spinner } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { useState } from "react";
import type { Card } from "@wikigems/domain/domain";
import {
  explorerAddressUrl,
  explorerTxUrl,
} from "@wikigems/domain/card-engine";
import { confirmCardMint, runApi, toggleCardTrade } from "../lib/api";
import { SOLANA_CLUSTER, mintCardNft, WalletError } from "../lib/solana";
import { showToast } from "../lib/ui";
import { walletStore } from "../lib/wallet";
import { CardArtwork } from "./GameCard";
import { Icon } from "./Icon";
export function CardModal(props: {
  card: Card;
  owned: boolean;
  linkedWallet: string | null;
  onClose: () => void;
  onChanged: (card: Card) => void;
  onProposeTrade?: (card: Card) => void;
  onOpenWallet: () => void;
}) {
  const [minting, setMinting] = useState(false);
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function mint() {
    if (!props.linkedWallet) {
      props.onOpenWallet();
      return;
    }
    const connected = walletStore.getSnapshot().wallet;
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
    try {
      const result = await mintCardNft(props.card, connected.adapter);
      const updated = await runApi(
        confirmCardMint(props.card.id, {
          mintAddress: result.mintAddress,
          signature: result.signature,
          walletAddress: connected.address,
        }),
      );
      props.onChanged(updated);
      showToast("Minted on Solana", {
        body: `${result.mintAddress.slice(0, 4)}…${result.mintAddress.slice(-4)} is now in your wallet.`,
        tone: "success",
      });
    } catch (cause) {
      haptic("error");
      if (cause instanceof WalletError && cause.code === "NO_SOL") {
        setError(cause.message);
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "The mint could not be completed.",
        );
      }
    } finally {
      setMinting(false);
    }
  }
  async function toggleListing() {
    setListing(true);
    try {
      const updated = await runApi(
        toggleCardTrade(props.card.id, !props.card.forTrade),
      );
      props.onChanged(updated);
      showToast(
        updated.forTrade
          ? "Card is open to trade"
          : "Card removed from the market",
        {
          tone: "success",
        },
      );
    } catch (cause) {
      showToast("Could not update the trade list", {
        body: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setListing(false);
    }
  }
  async function copyMint() {
    if (!props.card.mintAddress) return;
    try {
      await navigator.clipboard.writeText(props.card.mintAddress);
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
      busy={minting || listing}
      wide
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-accent">
            {props.card.category}
          </p>
          <h2 id="card-title" className="text-2xl font-semibold tracking-tight">
            {props.card.title}
          </h2>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={props.onClose}
          isDisabled={minting || listing}
          aria-label="Close card"
        >
          <Icon name="close" />
        </Button>
      </div>
      <CardArtwork card={props.card} className="max-h-72" />
      <div className="space-y-4">
        <p className="font-medium">{props.card.description}</p>
        <p className="text-sm leading-relaxed text-muted">
          {props.card.extract}
        </p>
        <a
          href={props.card.articleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
        >
          Read the Wikipedia article
          <Icon name="external" size={14} />
        </a>
      </div>
      {props.card.status === "minted" && props.card.mintAddress && (
        <div className="space-y-3 rounded-xl bg-default/50 p-4">
          <Chip color="success" size="sm" variant="soft">
            <Chip.Label>On Solana · {SOLANA_CLUSTER}</Chip.Label>
          </Chip>
          <Button
            variant="ghost"
            onPress={copyMint}
            aria-label="Copy mint address"
            className="h-auto w-full justify-between whitespace-normal"
          >
            <code className="min-w-0 text-left text-xs break-all">
              {props.card.mintAddress}
            </code>
            <Icon name="copy" size={15} />
          </Button>
          <div className="flex flex-wrap gap-4 text-xs text-accent">
            <a
              href={explorerAddressUrl(props.card.mintAddress, SOLANA_CLUSTER)}
              target="_blank"
              rel="noreferrer"
            >
              View asset ↗
            </a>
            {props.card.txSignature && (
              <a
                href={explorerTxUrl(props.card.txSignature, SOLANA_CLUSTER)}
                target="_blank"
                rel="noreferrer"
              >
                View transaction ↗
              </a>
            )}
          </div>
        </div>
      )}
      {props.owned && props.card.status === "claimed" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              feedback="confirm"
              onPress={mint}
              isDisabled={minting || listing}
            >
              {minting ? (
                <>
                  <Spinner size="sm" />
                  Minting on Solana…
                </>
              ) : (
                <>
                  <Icon name="bolt" />
                  {props.linkedWallet
                    ? "Mint NFT on Solana"
                    : "Connect wallet to mint"}
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              feedback="sell"
              onPress={toggleListing}
              isDisabled={listing || minting}
            >
              {listing && <Spinner size="sm" />}
              {props.card.forTrade ? "Listed for trade" : "List for trade"}
            </Button>
          </div>
          {error && (
            <Alert status="danger" role="alert">
              <Alert.Content>
                <Alert.Description>
                  {error}{" "}
                  <a
                    href="https://faucet.solana.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Get devnet SOL ↗
                  </a>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Unminted claims can be traded in-game. Once minted, ownership lives
            in your Solana wallet.
          </p>
        </div>
      )}
      {!props.owned && props.card.forTrade && (
        <Button
          feedback="swap"
          onPress={() => props.onProposeTrade?.(props.card)}
        >
          <Icon name="swap" />
          Propose a trade
        </Button>
      )}
      <Separator />
      <p className="text-xs leading-relaxed text-muted">
        Article text from Wikipedia, under CC BY-SA 4.0. Images from Wikimedia
        Commons.
      </p>
    </WebDialog>
  );
}
