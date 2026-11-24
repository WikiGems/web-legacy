import { createSignal, onSettled, Show } from "solid-js";
import { Wallet } from "../services/wallet";
import { runUi } from "../runtime";
import type { WalletVaultStatus } from "../../shared/wallet-vault";
import { WalletConnections } from "./WalletModal";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";

export function WalletAccess(props: {
  status: WalletVaultStatus;
  onReady: (address: string) => void;
  onCancel?: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  let panel: HTMLElement | undefined;
  onSettled(() => panel?.focus());
  const [connect, setConnect] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const canCreate = () => !props.status.walletAddress;
  const canUnlock = () => Boolean(props.status.vault?.wrappers.length);
  function setPending(value: boolean) {
    setBusy(value);
    props.onBusy?.(value);
  }
  async function open() {
    setError("");
    setPending(true);
    const result = await runUi(
      Wallet.use((wallet) =>
        canCreate() ? wallet.createEmbedded() : wallet.unlockEmbedded,
      ),
      (failure) => setError(failure.message),
    );
    setPending(false);
    if (result.ok) props.onReady(result.value.address);
  }

  return (
    <section
      class="space-y-3 rounded-xl bg-base-200 p-4"
      aria-label="Wallet access"
      ref={panel}
      tabindex="-1"
    >
      <Show when={canCreate() || canUnlock()}>
        <p class="text-sm text-muted">
          {canCreate()
            ? "Create a wallet with a passkey or use one you already have."
            : "Unlock your wallet to approve this payment."}
        </p>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Show when={canCreate() || canUnlock()}>
          <Button
            pending={busy() && !connect()}
            disabled={busy()}
            onClick={() => void open()}
          >
            {canCreate() ? "Create wallet with a passkey" : "Unlock wallet"}
          </Button>
        </Show>
        <Button
          variant="secondary"
          disabled={busy()}
          aria-expanded={connect() ? "true" : "false"}
          onClick={() => setConnect(!connect())}
        >
          {props.status.walletAddress
            ? "Connect linked wallet"
            : "Connect an existing wallet"}
        </Button>
        <Show when={props.onCancel}>
          <Button variant="ghost" disabled={busy()} onClick={props.onCancel}>
            Cancel
          </Button>
        </Show>
      </div>
      <Show when={connect()}>
        <WalletConnections
          expectedAddress={props.status.walletAddress}
          onConnected={props.onReady}
          onBusy={setPending}
        />
      </Show>
      <Show when={error()}>
        <Alert status="danger" role="alert">
          {error()}
        </Alert>
      </Show>
    </section>
  );
}
