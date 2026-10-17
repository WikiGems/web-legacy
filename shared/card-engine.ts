import type { CardDraft, FeaturedArticle, Rarity } from "./domain";

export const PACK_SIZE = 5;
export const PACK_INTERVAL_MS = 10 * 60 * 1000;
export const MAX_PACKS = 10;

export const RARITY_META: Record<
  Rarity,
  { label: string; code: string; color: string; deep: string; glow: string; weight: number }
> = {
  common: {
    label: "Common",
    code: "C",
    color: "#c5cec7",
    deep: "#7f8c83",
    glow: "rgba(197, 206, 199, 0.24)",
    weight: 42,
  },
  uncommon: {
    label: "Uncommon",
    code: "U",
    color: "#b8eccb",
    deep: "#3b9e6b",
    glow: "rgba(80, 220, 150, 0.26)",
    weight: 27,
  },
  rare: {
    label: "Rare",
    code: "R",
    color: "#b8d8ff",
    deep: "#3e79bd",
    glow: "rgba(86, 158, 255, 0.3)",
    weight: 16,
  },
  epic: {
    label: "Epic",
    code: "E",
    color: "#d8c2ff",
    deep: "#8859ce",
    glow: "rgba(158, 107, 255, 0.34)",
    weight: 9,
  },
  legendary: {
    label: "Legendary",
    code: "L",
    color: "#ffd49a",
    deep: "#ba6e16",
    glow: "rgba(255, 178, 76, 0.38)",
    weight: 5,
  },
  mythic: {
    label: "Mythic",
    code: "M",
    color: "#ffb6c9",
    deep: "#b52b56",
    glow: "rgba(255, 93, 140, 0.42)",
    weight: 1,
  },
};

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export function rarityFor(pageviews: number): Rarity {
  if (pageviews >= 5_000_000) return "mythic";
  if (pageviews >= 2_000_000) return "legendary";
  if (pageviews >= 1_000_000) return "epic";
  if (pageviews >= 500_000) return "rare";
  if (pageviews >= 100_000) return "uncommon";
  return "common";
}

export function rarityRank(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function statsFor(article: Pick<FeaturedArticle, "extract" | "pageviews" | "articleId">): {
  attack: number;
  defense: number;
} {
  const salt = hashString(`${article.articleId}:${article.extract.slice(0, 80)}`);
  const attack = clamp(
    Math.round(1350 + Math.log10(article.pageviews + 10) * 880 + (salt % 560)),
    800,
    9999,
  );
  const defense = clamp(
    Math.round(
      1250 +
        Math.min(4200, article.extract.length * 2.1) +
        ((salt >>> 9) % 640),
    ),
    800,
    9999,
  );
  return { attack, defense };
}

export function categoryFor(title: string, description: string, extract: string): string {
  const text = `${title} ${description} ${extract}`.toLowerCase();
  if (
    /(physicist|chemist|scientist|mathematic|astronom|biology|photosynthesis|black hole|planet|saturn|moon|spacecraft)/.test(
      text,
    )
  ) {
    return "Science";
  }
  if (
    /(species|animal|bird|fish|whale|octopus|jellyfish|penguin|tree|plant|reef|aurora|insect)/.test(
      text,
    )
  ) {
    return "Nature";
  }
  if (
    /(film|novel|band|album|artist|painter|game|manga|studio|music|beatles|shrek|mario|comic)/.test(
      text,
    )
  ) {
    return "Culture";
  }
  if (
    /(city|country|monument|mountain|wall|tower|bridge|ruins|empire|inca|pyramid|fuji|palace)/.test(
      text,
    )
  ) {
    return "Places";
  }
  if (/(company|software|computer|internet|bitcoin|crypto|technology|console|programming)/.test(text)) {
    return "Technology";
  }
  return "Knowledge";
}

export function draftFromArticle(article: FeaturedArticle): CardDraft {
  const rarity = rarityFor(article.pageviews);
  const { attack, defense } = statsFor(article);
  return {
    articleId: article.articleId,
    title: article.title,
    description: article.description,
    extract: article.extract,
    imageUrl: article.imageUrl,
    articleUrl: article.articleUrl,
    category: article.category || categoryFor(article.title, article.description, article.extract),
    rarity,
    attack,
    defense,
    pageviews: article.pageviews,
  };
}

export function shortNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function timeUntil(timestamp: number): string {
  const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function explorerAddressUrl(address: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

export function explorerTxUrl(signature: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}
