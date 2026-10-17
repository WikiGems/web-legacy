import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { linkWallet, requestWalletChallenge, runApi } from "../lib/api";
import { base64FromBytes } from "../lib/solana";
import {
  closeWalletModal,
  noteWalletLinked,
  showToast,
  walletModalOpen,
} from "../lib/ui";
import { connectWallet, walletOptions } from "../lib/wallet";
import { Icon } from "./Icon";

type Step = "idle" | "connecting" | "signing" | "linking";

export function WalletModal() {
  const [step, setStep] = createSignal<Step>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [activeWallet, setActiveWallet] = createSignal<string | null>(null);
  const options = () => walletOptions();

  function close() {
    if (step() !== "idle") return;
    closeWalletModal();
    setError(null);
    setStep("idle");
  }

  async function connect(id: "phantom" | "solflare" | "backpack") {
    setError(null);
    setActiveWallet(id);
    setStep("connecting");
    try {
      const wallet = await connectWallet(id);
      setStep("signing");
      const challenge = await runApi(requestWalletChallenge(wallet.address));
      const signature = await wallet.adapter.signMessage(
        new TextEncoder().encode(challenge.message),
      );
      setStep("linking");
      await runApi(linkWallet(wallet.address, base64FromBytes(signature)));
      noteWalletLinked();
      showToast("Wallet linked", {
        body: `${wallet.name} · ${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`,
        tone: "success",
      });
      setStep("idle");
      closeWalletModal();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The wallet could not be linked.";
      setError(
        /user rejected|denied|cancel/i.test(message)
          ? "The wallet request was cancelled. Nothing was linked."
          : message,
      );
      setStep("idle");
    }
  }

  createEffect(() => {
    if (!walletModalOpen()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return (
    <Show when={walletModalOpen()}>
      <Portal>
        <div
          class="modal-scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div class="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
            <div class="wallet-head">
              <div>
                <p class="eyebrow">Solana wallet</p>
                <h2 id="wallet-title">Mint your cards for real.</h2>
              </div>
              <button class="icon-button" onClick={close} aria-label="Close wallet dialog">
                <Icon name="close" />
              </button>
            </div>

            <p class="wallet-lede">
              Link a devnet wallet to mint 1-of-1 cards as Metaplex Core NFTs. You pay the tiny
              network fee; WikiGems never holds your keys.
            </p>

            <Show
              when={options().length > 0}
              fallback={
                <div class="wallet-empty">
                  <Icon name="wallet" size={34} />
                  <h3>No Solana wallet found.</h3>
                  <p>Install Phantom, Solflare, or Backpack, then refresh this page.</p>
                  <a
                    class="btn btn-primary"
                    href="https://phantom.app/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get Phantom <Icon name="external" size={15} />
                  </a>
                </div>
              }
            >
              <div class="wallet-options">
                <For each={options()}>
                  {(option) => (
                    <button
                      class="wallet-option"
                      onClick={() => connect(option.id)}
                      disabled={step() !== "idle"}
                    >
                      <span class={`wallet-glyph wallet-glyph--${option.id}`}>
                        {option.name.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{option.name}</strong>
                        <small>Detected in this browser</small>
                      </span>
                      <Show
                        when={step() !== "idle" && activeWallet() === option.id}
                        fallback={<Icon name="arrow-right" size={17} />}
                      >
                        <span class="spinner spinner--ink" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <div class="wallet-note">
              <Icon name="info" size={15} />
              <p>
                Use <strong>Devnet</strong> in your wallet. Need test SOL?{" "}
                <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">
                  Open the Solana faucet <Icon name="external" size={11} />
                </a>
              </p>
            </div>

            <Show when={step() !== "idle"}>
              <p class="wallet-status mono">
                {step() === "connecting" && "CONNECTING TO WALLET…"}
                {step() === "signing" && "SIGN THE LINK MESSAGE IN YOUR WALLET…"}
                {step() === "linking" && "VERIFYING WALLET OWNERSHIP…"}
              </p>
            </Show>
            <Show when={error()}>
              <p class="auth-error" role="alert">
                {error()}
              </p>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
