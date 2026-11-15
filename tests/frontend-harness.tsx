import { ToastHost } from "../src/components/ToastHost";
import { SystemTheme } from "../src/components/SystemTheme";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { CardModal } from "../src/components/CardModal";
import { PackOpening } from "../src/components/PackOpening";
import { TradeOfferModal } from "../src/components/TradeOfferModal";
import { DuelGame } from "../src/components/DuelGame";
import { WalletModal } from "../src/components/WalletModal";
import { openWalletModal, showToast } from "../src/lib/ui";
import { showcaseCards } from "../src/lib/preview";
import { MoneyAmount } from "../src/components/MoneyAmount";

const cards = showcaseCards();
const card = cards[0];
if (!card) throw new Error("A fixture card is required");
const fixtureCard = card;
const amounts = [0.4, 1000.01, 0, -2.5, 1.005, Number.MAX_SAFE_INTEGER];
function MoneyPreview() {
  const [index, setIndex] = useState(0);
  return (
    <section className="p-4" aria-label="Money preview">
      <div data-testid="money-preview">
        <MoneyAmount amount={amounts[index] ?? 0} currency="USDC" />
      </div>
      <Button
        onPress={() => setIndex((current) => (current + 1) % amounts.length)}
      >
        Change amount
      </Button>
    </section>
  );
}
function ToastPreview() {
  return (
    <section aria-label="Toast preview" className="flex flex-wrap gap-2 p-4">
      <Button
        onPress={() => {
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
      <Button
        onPress={() =>
          showToast("Card saved", {
            tone: "success",
            body: "Your collection is up to date.",
            duration: Infinity,
          })
        }
      >
        Success notification
      </Button>
      <Button
        onPress={() =>
          showToast("Trade failed", {
            tone: "error",
            body: "Please try again.",
            duration: Infinity,
          })
        }
      >
        Error notification
      </Button>
      <Button
        onPress={() =>
          showToast("Wallet connection needed", {
            tone: "info",
            body: "Connect your wallet to continue.",
            duration: Infinity,
          })
        }
      >
        Info notification
      </Button>
      <Button
        onPress={() =>
          showToast("Address copied", { tone: "success", duration: 2000 })
        }
      >
        Timed notification
      </Button>
    </section>
  );
}
function Harness() {
  const [dialog, setDialog] = useState<"card" | "pack" | "trade" | null>(null);
  const [result, setResult] = useState("");
  const close = () => setDialog(null);
  return (
    <>
      <SystemTheme />
      <ToastHost />
      <Button onPress={() => setDialog("card")}>Open card</Button>
      <Button onPress={() => setDialog("pack")}>Open pack</Button>
      <Button onPress={() => setDialog("trade")}>Open trade</Button>
      <Button onPress={openWalletModal}>Open wallet</Button>
      <p role="status">{result}</p>
      {dialog === "card" && (
        <CardModal
          card={fixtureCard}
          owned={false}
          linkedWallet={null}
          onClose={close}
          onChanged={() => {}}
          onOpenWallet={openWalletModal}
        />
      )}
      {dialog === "pack" && (
        <PackOpening
          cards={cards.slice(0, 3)}
          onClose={close}
          onComplete={() => {
            setResult("Pack kept");
            close();
          }}
        />
      )}
      {dialog === "trade" && (
        <TradeOfferModal
          target={{ ...fixtureCard, id: "target" }}
          cards={cards.slice(1, 4)}
          onClose={close}
          onSubmitted={() => {
            setResult("Trade submitted");
            close();
          }}
        />
      )}
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
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  </StrictMode>,
);
