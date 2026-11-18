import { For } from "solid-js";
import { Icon } from "../components/Icon";
import { MoneyAmount } from "../components/MoneyAmount";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
  StatCard,
} from "../components/Page";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Chip, Separator } from "../components/ui/feedback";

const examplePublicKey = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";

export default function Wallet() {
  return (
    <Page>
      <PageHeader
        eyebrow="Your wallet"
        title="Wallet"
        description="Your place in the collection. Addresses, balances, and account connections, all together."
        action={<PreviewChip />}
      />
      <PreviewNotice>
        This is an example wallet. The address and balances are sample data, and
        connection controls are inactive.
      </PreviewNotice>
      <div class="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader class="flex-row items-center justify-between">
            <div class="space-y-1">
              <p class="text-xs text-muted">Solana wallet</p>
              <CardTitle>Example public key</CardTitle>
            </div>
            <Chip tone="accent">Devnet</Chip>
          </CardHeader>
          <CardContent class="space-y-5">
            <code class="block rounded-xl bg-base-200 p-4 text-sm leading-relaxed break-all">
              {examplePublicKey}
            </code>
            <p class="flex items-center gap-2 text-xs text-muted">
              <Icon name="shield" size={15} />A sample address. No wallet is
              connected here.
            </p>
          </CardContent>
        </Card>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Example network balance"
            value={
              <MoneyAmount
                amount={2.5}
                currency="SOL"
                unitClass="text-sm font-normal text-muted"
              />
            }
            icon="wallet"
            detail="SOL is used for network fees."
          />
          <StatCard
            label="Example account balance"
            value={
              <MoneyAmount
                amount={125}
                currency="USDC"
                unitClass="text-sm font-normal text-muted"
              />
            }
            icon="coin"
          />
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Keep your collection close, wherever you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <For each={["Google", "Apple ID"]}>
            {(provider, index) => (
              <div>
                {index() > 0 && <Separator class="mb-4" />}
                <div class="flex flex-wrap items-center justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <span class="flex size-10 items-center justify-center rounded-xl bg-base-200 text-sm font-semibold">
                      {provider[0]}
                    </span>
                    <div>
                      <p class="text-sm font-medium">{provider}</p>
                      <p class="text-xs text-muted">Not connected · preview</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" disabled>
                    Connect {provider}
                  </Button>
                </div>
              </div>
            )}
          </For>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="flex flex-wrap items-center justify-between gap-4">
          <div class="space-y-1">
            <h2 class="font-semibold">Private key</h2>
            <p class="text-sm text-muted">
              Key export is not available in this preview.
            </p>
          </div>
          <Button variant="secondary" disabled>
            <Icon name="lock" size={16} />
            Export private key
          </Button>
        </CardContent>
      </Card>
    </Page>
  );
}
