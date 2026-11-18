import { createSignal, For, Show } from "solid-js";
import { Effect } from "effect";
import { Api } from "@wikigems/client";
import { haptic } from "../lib/haptics";
import { closeWalletModal, showToast, useWalletState } from "../lib/ui";
import { getService, runUi } from "../runtime";
import { Wallet, type WalletId } from "../services/wallet";
import { Icon } from "./Icon";
import { Button, buttonClass } from "./ui/button";
import { Alert, Spinner } from "./ui/feedback";
import { WebDialog } from "./WebDialog";

type Step = "idle" | "connecting" | "signing" | "linking";

export function WalletModal() {
  const state = useWalletState();
  const [step, setStep] = createSignal<Step>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [activeWallet, setActiveWallet] = createSignal<string | null>(null);
  const wallets = getService(Wallet);
  const options = () => (state().modalOpen ? Effect.runSync(wallets.options) : []);

  function close() {
    if (step() !== "idle") return;
    closeWalletModal();
    setError(null);
  }

  // Connect, prove ownership by signing the server's challenge, then link.
  function connect(id: WalletId) {
    setError(null);
    setActiveWallet(id);
    setStep("connecting");
    void runUi(
      Effect.gen(function* () {
        const wallet = yield* wallets.connect(id);
        yield* Effect.sync(() => setStep("signing"));
        const challenge = yield* Api.use((api) =>
          api.requestWalletChallenge(wallet.address),
        );
        const signature = yield* wallets.signMessage(wallet, challenge.message);
        yield* Effect.sync(() => setStep("linking"));
        yield* Api.use((api) => api.linkWallet(wallet.address, signature));
        return wallet;
      }),
      (failure) => {
        haptic("error");
        const message = failure.message || "The wallet could not be linked.";
        setError(
          /user rejected|denied|cancel/i.test(message)
            ? "The wallet request was cancelled. Nothing was linked."
            : message,
        );
      },
    ).then((outcome) => {
      setStep("idle");
      if (!outcome.ok) return;
      const wallet = outcome.value;
      showToast("Wallet linked", {
        body: `${wallet.name} · ${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`,
        tone: "success",
      });
      closeWalletModal();
    });
  }

  return (
    <Show when={state().modalOpen}>
      <WebDialog onClose={close} labelId="wallet-title" busy={step() !== "idle"}>
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-2">
            <p class="text-xs font-medium text-primary">Solana wallet</p>
            <h2 id="wallet-title" class="text-2xl font-semibold">
              Your cards. Your wallet.
            </h2>
          </div>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            onClick={close}
            disabled={step() !== "idle"}
            aria-label="Close wallet dialog"
          >
            <Icon name="close" />
          </Button>
        </div>
        <p class="text-sm leading-relaxed text-muted">
          Link a devnet wallet to mint unique article cards. Your wallet signs
          each transaction; WikiGems never holds your keys.
        </p>
        <Show
          when={options().length}
          fallback={
            <div class="space-y-4 rounded-2xl bg-base-200 px-5 py-8 text-center">
              <Icon name="wallet" size={32} class="mx-auto text-muted" />
              <h3 class="font-semibold">No Solana wallet found.</h3>
              <p class="text-sm text-muted">
                Install Phantom, Solflare, or Backpack, then refresh this page.
              </p>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noreferrer"
                class={buttonClass("secondary")}
              >
                Get Phantom
                <Icon name="external" size={14} />
              </a>
            </div>
          }
        >
          <div class="space-y-3">
            <For each={options()}>
              {(option) => (
                <Button
                  variant="secondary"
                  class="h-auto w-full justify-between py-4"
                  onClick={() => connect(option.id)}
                  disabled={step() !== "idle"}
                >
                  <span class="flex items-center gap-3">
                    <Icon name="wallet" />
                    <span>{option.name}</span>
                  </span>
                  <Show
                    when={step() !== "idle" && activeWallet() === option.id}
                    fallback={<Icon name="arrow-right" size={16} />}
                  >
                    <Spinner size="sm" />
                  </Show>
                </Button>
              )}
            </For>
          </div>
        </Show>
        <p class="text-xs leading-relaxed text-muted">
          Use Devnet in your wallet. Need test SOL?{" "}
          <a
            href="https://faucet.solana.com/"
            target="_blank"
            rel="noreferrer"
            class="text-primary hover:underline"
          >
            Open the Solana faucet ↗
          </a>
        </p>
        <Show when={step() !== "idle"}>
          <p role="status" class="flex items-center gap-2 text-sm">
            <Spinner size="sm" />
            {step() === "connecting"
              ? "Connecting to wallet…"
              : step() === "signing"
                ? "Sign the link message in your wallet…"
                : "Verifying wallet ownership…"}
          </p>
        </Show>
        <Show when={error()}>
          <Alert status="danger" role="alert">
            {error()}
          </Alert>
        </Show>
      </WebDialog>
    </Show>
  );
}
