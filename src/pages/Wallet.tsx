import { MoneyAmount } from "../components/MoneyAmount";
import { Card, Chip, Separator } from "@heroui/react";
import { HapticButton as Button } from "../components/HapticButton";
import { Icon } from "../components/Icon";
import {
  Page,
  PageHeader,
  PreviewChip,
  PreviewNotice,
  StatCard,
} from "../components/Page";
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
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <Card.Header className="flex-row items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted">Solana wallet</p>
              <Card.Title>Example public key</Card.Title>
            </div>
            <Chip color="accent" size="sm" variant="soft">
              <Chip.Label>Devnet</Chip.Label>
            </Chip>
          </Card.Header>
          <Card.Content className="space-y-5">
            <code className="block rounded-xl bg-default/60 p-4 text-sm leading-relaxed break-all">
              {examplePublicKey}
            </code>
            <p className="flex items-center gap-2 text-xs text-muted">
              <Icon name="shield" size={15} />A sample address. No wallet is
              connected here.
            </p>
          </Card.Content>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Example network balance"
            value={
              <MoneyAmount
                amount={2.5}
                currency="SOL"
                unitClassName="text-sm font-normal text-muted"
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
                unitClassName="text-sm font-normal text-muted"
              />
            }
            icon="coin"
          />
        </div>
      </div>
      <Card>
        <Card.Header>
          <Card.Title>Connected accounts</Card.Title>
          <Card.Description>
            Keep your collection close, wherever you sign in.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-4">
          {["Google", "Apple ID"].map((provider, index) => (
            <div key={provider}>
              {index > 0 && <Separator className="mb-4" />}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-default text-sm font-semibold">
                    {provider[0]}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{provider}</p>
                    <p className="text-xs text-muted">
                      Not connected · preview
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" isDisabled>
                  Connect {provider}
                </Button>
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>
      <Card>
        <Card.Content className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold">Private key</h2>
            <p className="text-sm text-muted">
              Key export is not available in this preview.
            </p>
          </div>
          <Button variant="secondary" isDisabled>
            <Icon name="lock" size={16} />
            Export private key
          </Button>
        </Card.Content>
      </Card>
    </Page>
  );
}
