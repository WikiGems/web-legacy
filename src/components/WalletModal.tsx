import { haptic } from "../lib/haptics";
import { WebDialog } from "./WebDialog";
import { Alert, Spinner } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { linkWallet, requestWalletChallenge, runApi } from "../lib/api";
import { base64FromBytes } from "../lib/solana";
import { closeWalletModal, showToast, useUi } from "../lib/ui";
import { connectWallet, walletOptions } from "../lib/wallet";
import { Icon } from "./Icon";
type Step = "idle" | "connecting" | "signing" | "linking";
export function WalletModal() {
  const { walletModalOpen } = useUi();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  const options = walletOptions();
  function close() {
    if (step !== "idle") return;
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
      await queryClient.invalidateQueries({ queryKey: ["account"] });
      showToast("Wallet linked", {
        body: `${wallet.name} · ${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`,
        tone: "success",
      });
      setStep("idle");
      closeWalletModal();
    } catch (cause) {
      haptic("error");
      const message =
        cause instanceof Error
          ? cause.message
          : "The wallet could not be linked.";
      setError(
        /user rejected|denied|cancel/i.test(message)
          ? "The wallet request was cancelled. Nothing was linked."
          : message,
      );
      setStep("idle");
    }
  }
  return walletModalOpen ? (
    <WebDialog onClose={close} labelId="wallet-title" busy={step !== "idle"}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-accent">Solana wallet</p>
          <h2 id="wallet-title" className="text-2xl font-semibold">
            Your cards. Your wallet.
          </h2>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={close}
          isDisabled={step !== "idle"}
          aria-label="Close wallet dialog"
        >
          <Icon name="close" />
        </Button>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Link a devnet wallet to mint unique article cards. Your wallet signs
        each transaction; WikiGems never holds your keys.
      </p>
      {options.length ? (
        <div className="space-y-3">
          {options.map((option) => (
            <Button
              key={option.id}
              variant="secondary"
              className="h-auto w-full justify-between py-4"
              onPress={() => connect(option.id)}
              isDisabled={step !== "idle"}
            >
              <span className="flex items-center gap-3">
                <Icon name="wallet" />
                <span>{option.name}</span>
              </span>
              {step !== "idle" && activeWallet === option.id ? (
                <Spinner size="sm" />
              ) : (
                <Icon name="arrow-right" size={16} />
              )}
            </Button>
          ))}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl bg-default/50 px-5 py-8 text-center">
          <Icon name="wallet" size={32} className="mx-auto text-muted" />
          <h3 className="font-semibold">No Solana wallet found.</h3>
          <p className="text-sm text-muted">
            Install Phantom, Solflare, or Backpack, then refresh this page.
          </p>
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noreferrer"
            className="button button--secondary"
          >
            Get Phantom
            <Icon name="external" size={14} />
          </a>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted">
        Use Devnet in your wallet. Need test SOL?{" "}
        <a
          href="https://faucet.solana.com/"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Open the Solana faucet ↗
        </a>
      </p>
      {step !== "idle" && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner size="sm" />
          {step === "connecting"
            ? "Connecting to wallet…"
            : step === "signing"
              ? "Sign the link message in your wallet…"
              : "Verifying wallet ownership…"}
        </p>
      )}
      {error && (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </WebDialog>
  ) : null;
}
