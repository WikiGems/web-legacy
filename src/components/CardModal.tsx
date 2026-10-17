import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { Card } from "../../shared/domain";
import { RARITY_META, explorerAddressUrl, explorerTxUrl, shortNumber } from "../../shared/card-engine";
import { confirmCardMint, runApi, toggleCardTrade } from "../lib/api";
import { SOLANA_CLUSTER, mintCardNft, WalletError } from "../lib/solana";
import { showToast } from "../lib/ui";
import { wallet } from "../lib/wallet";
import { GameCard } from "./GameCard";
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
  const [minting, setMinting] = createSignal(false);
  const [listing, setListing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const meta = () => RARITY_META[props.card.rarity];

  createEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  async function mint() {
    if (!props.linkedWallet) {
      props.onOpenWallet();
      return;
    }
    const connected = wallet();
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
      if (cause instanceof WalletError && cause.code === "NO_SOL") {
        setError(cause.message);
      } else {
        setError(cause instanceof Error ? cause.message : "The mint could not be completed.");
      }
    } finally {
      setMinting(false);
    }
  }

  async function toggleListing() {
    setListing(true);
    try {
      const updated = await runApi(toggleCardTrade(props.card.id, !props.card.forTrade));
      props.onChanged(updated);
      showToast(updated.forTrade ? "Card is open to trade" : "Card removed from the market", {
        tone: "success",
      });
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
    await navigator.clipboard.writeText(props.card.mintAddress);
    showToast("Mint address copied", { tone: "success" });
  }

  return (
    <Portal>
      <div
        class="modal-scrim card-modal-scrim"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
      >
        <div class="card-modal" role="dialog" aria-modal="true" aria-labelledby="card-title">
          <button class="icon-button card-modal-close" onClick={props.onClose} aria-label="Close card">
            <Icon name="close" />
          </button>

          <div class="card-modal-art" style={`--rarity-color:${meta().color};--rarity-deep:${meta().deep}`}>
            <GameCard card={props.card} size="lg" />
          </div>

          <div class="card-modal-info">
            <div class="card-modal-head">
              <div>
                <p class="eyebrow">
                  {props.card.category} · {shortNumber(props.card.pageviews)} yearly views
                </p>
                <h2 id="card-title">{props.card.title}</h2>
                <p class="card-modal-desc">{props.card.description}</p>
              </div>
              <span class="card-modal-one">1 / 1</span>
            </div>

            <div class="card-modal-stats">
              <div>
                <Icon name="sword" size={18} />
                <span class="mono">ATTACK</span>
                <strong>{props.card.attack.toLocaleString()}</strong>
              </div>
              <div>
                <Icon name="shield" size={18} />
                <span class="mono">DEFENSE</span>
                <strong>{props.card.defense.toLocaleString()}</strong>
              </div>
              <div>
                <Icon name="globe" size={18} />
                <span class="mono">RARITY</span>
                <strong>{meta().label}</strong>
              </div>
            </div>

            <div class="card-modal-extract">
              <p>{props.card.extract}</p>
              <a href={props.card.articleUrl} target="_blank" rel="noreferrer" class="text-link">
                Read the Wikipedia article <Icon name="external" size={13} />
              </a>
            </div>

            <Show when={props.card.status === "minted" ? props.card : null}>
              {(minted) => (
                <div class="minted-panel">
                  <div class="minted-panel-head">
                    <span class="onchain-chip onchain-chip--large">
                      <Icon name="bolt" size={13} /> On Solana
                    </span>
                    <span class="mono">METAPLEX CORE · {SOLANA_CLUSTER.toUpperCase()}</span>
                  </div>
                  <button class="mint-address" onClick={copyMint} title="Copy mint address">
                    <span>{minted().mintAddress}</span>
                    <Icon name="copy" size={15} />
                  </button>
                  <div class="minted-links">
                    <a
                      class="text-link"
                      href={explorerAddressUrl(minted().mintAddress!, SOLANA_CLUSTER)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View asset <Icon name="external" size={13} />
                    </a>
                    <Show when={minted().txSignature}>
                      <a
                        class="text-link"
                        href={explorerTxUrl(minted().txSignature!, SOLANA_CLUSTER)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction <Icon name="external" size={13} />
                      </a>
                    </Show>
                  </div>
                </div>
              )}
            </Show>

            <Show when={props.owned && props.card.status === "claimed"}>
              <div class="card-modal-actions">
                <button class="btn btn-primary btn-lg" onClick={mint} disabled={minting()}>
                  <Show
                    when={minting()}
                    fallback={
                      <>
                        <Icon name="bolt" size={17} />
                        {props.linkedWallet ? "Mint NFT on Solana" : "Connect wallet to mint"}
                      </>
                    }
                  >
                    <span class="spinner" /> Minting on Solana…
                  </Show>
                </button>
                <button class="btn btn-outline btn-lg" onClick={toggleListing} disabled={listing()}>
                  <Icon name={props.card.forTrade ? "check" : "swap"} size={17} />
                  {props.card.forTrade ? "Listed for trade" : "List for trade"}
                </button>
              </div>
              <Show when={error()}>
                <div class="mint-error">
                  <p>{error()}</p>
                  <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer" class="text-link">
                    Get devnet SOL <Icon name="external" size={12} />
                  </a>
                </div>
              </Show>
              <p class="card-modal-fine">
                The 1-of-1 claim is held in the game until you mint. Once minted, the NFT lives in
                your devnet wallet and is no longer tradable in-game.
              </p>
            </Show>

            <Show when={!props.owned && props.card.forTrade}>
              <button class="btn btn-primary btn-lg btn-full" onClick={() => props.onProposeTrade?.(props.card)}>
                <Icon name="swap" size={17} /> Propose a trade
              </button>
            </Show>

            <Show when={props.owned && props.card.status === "minted"}>
              <p class="card-modal-fine">
                This card is minted. Its ownership can be moved on Solana from your wallet or a
                marketplace — in-game claims cannot touch it.
              </p>
            </Show>

            <p class="card-modal-license">
              Article text from Wikipedia, available under CC BY-SA 4.0. Card art sourced from
              Wikimedia Commons.
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
