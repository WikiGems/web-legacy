import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import type { Effect } from "effect";
import { Link } from "@tanstack/solid-router";
import { Page } from "../components/Page";
import { WebDialog } from "../components/WebDialog";
import { Button, buttonClass } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert } from "../components/ui/feedback";
import { useSession } from "../lib/session";
import type { WalletError } from "../lib/solana-wallets";
import { openWalletModal, useWalletState } from "../lib/ui";
import { getService, runUi } from "../runtime";
import { Wallet as WalletService } from "../services/wallet";
import {
  MAX_WALLET_WRAPPERS,
  type WalletVaultStatus,
} from "../../shared/wallet-vault";

export default function Wallet() {
  const session = useSession();
  return (
    <Page>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Wallet</h1>
      <Show
        when={session().data?.session.token}
        keyed
        fallback={
          <Show when={!session().pending}>
            <Link to="/login" class={buttonClass()}>
              Sign in to use your wallet
            </Link>
          </Show>
        }
      >
        {(_token) => <WalletSettings />}
      </Show>
    </Page>
  );
}

function WalletSettings() {
  const wallets = getService(WalletService);
  const state = useWalletState();
  const [status, setStatus] = createSignal<WalletVaultStatus | null>(null);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [secret, setSecret] = createSignal("");
  const [copied, setCopied] = createSignal(false);

  const fail = (failure: WalletError) => setError(failure.message);
  const reload = async () => {
    const result = await runUi(wallets.embeddedStatus, fail);
    if (result.ok) setStatus(result.value);
  };

  createEffect(
    () => state().modalOpen,
    (open) => {
      if (!open) void reload();
    },
  );

  function closeExport() {
    setSecret("");
    setCopied(false);
    setExportOpen(false);
  }

  onSettled(() => {
    const onVisibility = () => {
      if (document.hidden && secret()) closeExport();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", closeExport);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", closeExport);
      closeExport();
    };
  });

  async function perform<A>(
    action: Effect.Effect<A, WalletError>,
    complete?: (result: A) => void,
    updateStatus = true,
  ) {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      const result = await runUi(action, fail);
      if (result.ok) complete?.(result.value);
      if (updateStatus) await reload();
    } finally {
      setBusy(false);
    }
  }

  function createWallet() {
    const address = status()?.walletAddress ?? undefined;
    if (
      address &&
      !window.confirm(
        "Replace your linked wallet? Any cards or dollars in that wallet will stay there. Keep access to it.",
      )
    )
      return;
    void perform(wallets.createEmbedded({ replaceExternalAddress: address }));
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret());
      setCopied(true);
    } catch {
      setError(
        "Clipboard access failed. Copy the key manually and confirm that you saved it.",
      );
    }
  }

  return (
    <>
      <Show when={error() && !exportOpen()}>
        <Alert status="danger" role="alert">
          {error()}
        </Alert>
      </Show>
      <Show
        when={status()}
        fallback={
          <Show when={error()} fallback={<p role="status">Loading wallet…</p>}>
            <Button
              onClick={() => {
                setError("");
                void reload();
              }}
            >
              Try again
            </Button>
          </Show>
        }
      >
        {(current) => (
          <Card>
            <CardHeader>
              <CardTitle>
                {current().walletAddress
                  ? "Wallet address"
                  : "Set up your wallet"}
              </CardTitle>
              <CardDescription>
                {current().walletAddress
                  ? "Use your wallet to hold your cards and dollars."
                  : "Protect your wallet with a passkey, or connect a wallet you already use."}
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-5">
              <Show when={current().walletAddress}>
                <code class="block rounded-xl bg-base-200 p-4 text-sm break-all">
                  {current().walletAddress}
                </code>
              </Show>
              <Show
                when={current().vault}
                fallback={
                  <Button pending={busy()} onClick={createWallet}>
                    {current().walletAddress
                      ? "Replace linked wallet"
                      : "Create wallet"}
                  </Button>
                }
              >
                {(vault) => (
                  <Show
                    when={vault().wrappers.length}
                    fallback={
                      <p class="text-sm text-muted">
                        Connect the wallet where you imported your private key.
                      </p>
                    }
                  >
                    <div class="flex flex-wrap gap-2">
                      <Show
                        when={state().wallet?.kind === "embedded"}
                        fallback={
                          <Button
                            pending={busy()}
                            onClick={() =>
                              void perform(
                                wallets.unlockEmbedded,
                                undefined,
                                false,
                              )
                            }
                          >
                            Unlock wallet
                          </Button>
                        }
                      >
                        <Button
                          variant="secondary"
                          disabled={busy()}
                          onClick={() => void runUi(wallets.lockEmbedded)}
                        >
                          Lock wallet
                        </Button>
                      </Show>
                      <Button
                        variant="secondary"
                        disabled={busy()}
                        onClick={() => {
                          setError("");
                          setExportOpen(true);
                        }}
                      >
                        Export private key
                      </Button>
                    </div>
                    <div class="space-y-3">
                      <h3 class="font-semibold">Wallet passkeys</h3>
                      <ul class="space-y-2">
                        <For each={vault().wrappers}>
                          {(wrapper, index) => (
                            <li class="flex flex-wrap items-center justify-between gap-2">
                              <span class="text-sm">
                                Passkey {index() + 1} ·{" "}
                                {new Date(
                                  wrapper.createdAt,
                                ).toLocaleDateString()}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove passkey ${index() + 1}`}
                                disabled={
                                  busy() ||
                                  (vault().wrappers.length === 1 &&
                                    !vault().exportedAt)
                                }
                                onClick={() => {
                                  const warning =
                                    vault().wrappers.length === 1
                                      ? "Remove your last wallet passkey? You will need your saved private key to access your cards and dollars."
                                      : "Remove this wallet passkey?";
                                  if (window.confirm(warning))
                                    void perform(
                                      wallets.removeEmbeddedPasskey(
                                        wrapper.credentialId,
                                      ),
                                    );
                                }}
                              >
                                Remove
                              </Button>
                            </li>
                          )}
                        </For>
                      </ul>
                      <Button
                        variant="secondary"
                        disabled={
                          busy() ||
                          vault().wrappers.length >= MAX_WALLET_WRAPPERS
                        }
                        onClick={() => void perform(wallets.addEmbeddedPasskey)}
                      >
                        Add a wallet passkey
                      </Button>
                    </div>
                  </Show>
                )}
              </Show>
              <div>
                <Button
                  variant="ghost"
                  disabled={busy()}
                  onClick={openWalletModal}
                >
                  Connect an existing wallet
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Show>
      <Show when={exportOpen()}>
        <WebDialog
          labelId="export-key-title"
          onClose={closeExport}
          busy={busy()}
        >
          <h2 id="export-key-title" class="text-xl font-semibold">
            Export private key
          </h2>
          <Alert status="danger">
            Anyone with your private key can take your cards and dollars. Never
            share it. Keep your copy somewhere only you can access.
          </Alert>
          <Show when={error()}>
            <Alert status="danger" role="alert">
              {error()}
            </Alert>
          </Show>
          <Show
            when={secret()}
            fallback={
              <Button
                pending={busy()}
                onClick={() =>
                  void perform(
                    wallets.exportEmbedded,
                    (key) => {
                      if (!document.hidden) setSecret(key);
                    },
                    false,
                  )
                }
              >
                Reveal with a passkey
              </Button>
            }
          >
            <code
              aria-label="Private key"
              class="block rounded-xl bg-base-200 p-4 text-sm break-all"
            >
              {secret()}
            </code>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy()}
                onClick={() => void copySecret()}
              >
                {copied() ? "Key copied" : "Copy private key"}
              </Button>
              <Button
                pending={busy()}
                onClick={() =>
                  void perform(wallets.confirmEmbeddedExport, closeExport)
                }
              >
                I saved a copy
              </Button>
            </div>
          </Show>
          <Button variant="ghost" disabled={busy()} onClick={closeExport}>
            Close
          </Button>
        </WebDialog>
      </Show>
    </>
  );
}
