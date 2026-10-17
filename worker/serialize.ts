import type { Card, CardStatus, Rarity } from "../shared/domain";
import type { CardTable } from "./db";

export type CardRow = CardTable & { ownerName?: string | null };

export function serializeCard(row: CardRow): Card {
  return {
    id: row.id,
    articleId: row.articleId,
    title: row.title,
    description: row.description,
    extract: row.extract,
    imageUrl: row.imageUrl,
    articleUrl: row.articleUrl,
    category: row.category,
    rarity: row.rarity as Rarity,
    attack: row.attack,
    defense: row.defense,
    pageviews: row.pageviews,
    status: row.status as CardStatus,
    mintAddress: row.mintAddress,
    txSignature: row.txSignature,
    forTrade: Boolean(row.forTrade),
    ownerName: row.ownerName ?? undefined,
    createdAt: row.createdAt,
    mintedAt: row.mintedAt,
  };
}
