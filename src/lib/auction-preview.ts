import { dollarDecimal } from "../../shared/amounts";
import { showcaseCards } from "./preview";

// Preview amounts use integer micro-USDC, so six-decimal bids stay exact.
export function parseAuctionAmount(value: string): number | null {
  if (!/^(?:\d{1,9}(?:\.\d{0,6})?|\.\d{1,6})$/.test(value.trim())) return null;
  const [whole = "", fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return amount > 0 ? amount : null;
}

export function formatAuctionAmount(amount: number) {
  return dollarDecimal(BigInt(amount));
}

export const auctionCards = showcaseCards().slice(0, 4);
export const previewAuctions = showcaseCards()
  .slice(3, 6)
  .map((card, index) => {
    const currentBid = [300_000, 550_000, 800_000][index] ?? 300_000;
    const increment = 50_000;
    return {
      id: card.id,
      card,
      currentBid,
      increment,
      owner:
        ["PaperPlanets", "MuseumOfPages", "QuietCollector"][index] ??
        "Collector",
      bidCount: [3, 7, 12][index] ?? 3,
      timeRemaining: ["2h 15m", "8h 40m", "1d 3h"][index] ?? "2h 15m",
      bids: ["atlas.collects", "MapleArchive", "tideline"].map(
        (bidder, position) => ({
          bidder,
          amount: currentBid - increment * position,
          time:
            ["12 min ago", "28 min ago", "1 hour ago"][position] ??
            "1 hour ago",
        }),
      ),
    };
  });
