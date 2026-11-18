import { render } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import { CardModal } from "../src/components/CardModal";
import { DuelGame } from "../src/components/DuelGame";
import { MoneyAmount } from "../src/components/MoneyAmount";
import { PackOpening } from "../src/components/PackOpening";
import { SystemTheme } from "../src/components/SystemTheme";
import { ToastHost } from "../src/components/ToastHost";
import { TradeOfferModal } from "../src/components/TradeOfferModal";
import { Button } from "../src/components/ui/button";
import { WalletModal } from "../src/components/WalletModal";
import { showcaseCards } from "../src/lib/preview";
import { openWalletModal, showToast } from "../src/lib/ui";

const cards = showcaseCards();
const card = cards[0];
if (!card) throw new Error("A fixture card is required");
const fixtureCard = card;
const amounts = [0.4, 1000.01, 0, -2.5, 1.005, Number.MAX_SAFE_INTEGER];

function MoneyPreview() {
  const [index, setIndex] = createSignal(0);
  return (
    <section class="p-4" aria-label="Money preview">
      <div data-testid="money-preview">
        <MoneyAmount amount={amounts[index()] ?? 0} currency="USDC" />
      </div>
      <Button
        onClick={() => setIndex((current) => (current + 1) % amounts.length)}
      >
        Change amount
      </Button>
    </section>
  );
}

function ToastPreview() {
  const toast = (
    label: string,
    title: string,
    tone: "success" | "error" | "info",
    body?: string,
  ) => (
    <Button
      onClick={() => showToast(title, { tone, body, duration: Infinity })}
    >
      {label}
    </Button>
  );
  return (
    <section aria-label="Toast preview" class="flex flex-wrap gap-2 p-4">
      <Button
        onClick={() => {
          showToast("Card saved", { tone: "success", duration: Infinity });
          showToast("Trade failed", { tone: "error", duration: Infinity });
          showToast("Wallet connection needed", {
            tone: "info",
            duration: Infinity,
          });
        }}
      >
        Stack notifications
      </Button>
      {toast(
        "Success notification",
        "Card saved",
        "success",
        "Your collection is up to date.",
      )}
      {toast("Error notification", "Trade failed", "error", "Please try again.")}
      {toast(
        "Info notification",
        "Wallet connection needed",
        "info",
        "Connect your wallet to continue.",
      )}
      <Button
        onClick={() =>
          showToast("Address copied", { tone: "success", duration: 2000 })
        }
      >
        Timed notification
      </Button>
    </section>
  );
}

function Harness() {
  const [dialog, setDialog] = createSignal<"card" | "pack" | "trade" | null>(
    null,
  );
  const [result, setResult] = createSignal("");
  const close = () => setDialog(null);
  return (
    <>
      <SystemTheme />
      <ToastHost />
      <Button onClick={() => setDialog("card")}>Open card</Button>
      <Button onClick={() => setDialog("pack")}>Open pack</Button>
      <Button onClick={() => setDialog("trade")}>Open trade</Button>
      <Button onClick={openWalletModal}>Open wallet</Button>
      <p role="status">{result()}</p>
      <Show when={dialog() === "card"}>
        <CardModal
          card={fixtureCard}
          owned={false}
          linkedWallet={null}
          onClose={close}
          onChanged={() => {}}
          onOpenWallet={openWalletModal}
        />
      </Show>
      <Show when={dialog() === "pack"}>
        <PackOpening
          cards={cards.slice(0, 3)}
          onClose={close}
          onComplete={() => {
            setResult("Pack kept");
            close();
          }}
        />
      </Show>
      <Show when={dialog() === "trade"}>
        <TradeOfferModal
          target={{ ...fixtureCard, id: "target" }}
          cards={cards.slice(1, 4)}
          onClose={close}
          onSubmitted={() => {
            setResult("Trade submitted");
            close();
          }}
        />
      </Show>
      <WalletModal />
      <DuelGame
        cards={cards.slice(0, 4)}
        onFinished={(_won, score) => setResult(`Duel completed: ${score}`)}
      />
      <MoneyPreview />
      <ToastPreview />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
render(() => <Harness />, root);
