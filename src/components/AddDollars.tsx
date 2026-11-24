import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Api } from "@wikigems/client";
import type { WalletBalanceSchema } from "@wikigems/domain/domain";
import qrCode from "qrcode-generator";
import { formatDollars } from "../../shared/amounts";
import { runUi } from "../runtime";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Icon } from "./Icon";

const onrampEnabled = import.meta.env.VITE_DOLLARS_ONRAMP_ENABLED === "true";

export function AddDollars(props: { address: string }) {
  const [balance, setBalance] = createSignal<
    typeof WalletBalanceSchema.Type | null
  >(null);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [copyStatus, setCopyStatus] = createSignal("");
  const qr = createMemo(() => {
    const image = qrCode(0, "M");
    image.addData(props.address);
    image.make();
    return image.createDataURL(4);
  });

  async function reload() {
    setLoading(true);
    setFailed(false);
    const result = await runUi(Api.use((api) => api.fetchWalletBalance()));
    setLoading(false);
    if (result.ok && result.value.walletAddress === props.address)
      setBalance(result.value);
    else setFailed(true);
  }
  createEffect(
    () => props.address,
    () => void reload(),
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.address);
      setCopyStatus("Deposit address copied.");
    } catch {
      setCopyStatus("Clipboard unavailable. Select the address to copy it.");
    }
  }

  return (
    <Card id="add-dollars" class="scroll-mt-6">
      <CardHeader>
        <CardTitle>Add dollars</CardTitle>
        <CardDescription>
          Send supported dollars from a compatible wallet using this deposit
          address.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-base-200 p-4">
          <div class="min-w-0">
            <p class="text-sm text-muted">Dollar balance</p>
            <p
              class="text-2xl font-semibold wrap-anywhere tabular-nums"
              aria-live="polite"
            >
              {balance()
                ? formatDollars(balance()?.balanceUsdcMinor ?? "0")
                : "—"}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            pending={loading()}
            onClick={() => void reload()}
          >
            Refresh balance
          </Button>
        </div>
        <Show when={failed()}>
          <p role="status" class="text-sm text-muted">
            Balance unavailable. Try refreshing.
          </p>
        </Show>
        <div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <img
            src={qr()}
            width="132"
            height="132"
            alt="QR code for your deposit address"
            class="size-33 rounded-xl bg-white"
          />
          <div class="min-w-0 space-y-2">
            <p class="text-sm font-medium">Deposit address</p>
            <code class="block rounded-xl bg-base-200 p-3 text-sm break-all">
              {props.address}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copy()}>
              <Icon name="copy" size={15} /> Copy address
            </Button>
            <p class="min-h-5 text-xs text-muted" role="status">
              {copyStatus()}
            </p>
          </div>
        </div>
        <Show when={balance()}>
          {(details) => (
            <details>
              <summary class="cursor-pointer text-sm font-medium">
                Deposit details
              </summary>
              <dl class="mt-2 space-y-1 text-sm text-muted">
                <dt>Network</dt>
                <dd>{details().cluster}</dd>
                <dt>Dollar token address</dt>
                <dd>
                  <code class="break-all">{details().dollarTokenAddress}</code>
                </dd>
              </dl>
            </details>
          )}
        </Show>
        <Show when={onrampEnabled}>
          {/* Mount a payment provider here when card funding is implemented. */}
          <Button variant="secondary" disabled>
            Add with a card or Apple Pay
          </Button>
        </Show>
      </CardContent>
    </Card>
  );
}
