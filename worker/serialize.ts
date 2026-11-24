import type {
  Card,
  CardStatus,
  Claim,
  Listing,
  Purchase,
  Rarity,
} from "../shared/domain";
import type { Selectable } from "kysely";
import type {
  CardTable,
  ChainOperationTable,
  ClaimTable,
  ListingTable,
  PurchaseTable,
} from "./db";
import { requiredSigners } from "./chain/signing";

export type CardRow = Selectable<CardTable> & { ownerName?: string | null };

export function serializeCard(row: CardRow): Card {
  return {
    id: row.id,
    articleId: row.articleId,
    gemId: row.gemId,
    ownerWallet: row.ownerWallet,
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

export function serializeListing(row: ListingTable, card: CardRow): Listing {
  return {
    id: row.id,
    card: serializeCard(card),
    priceUsdcMinor: row.priceUsdcMinor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeOperation(row: ChainOperationTable) {
  return {
    id: row.id,
    cardId: row.cardId,
    state: row.state,
    priceUsdcMinor: row.priceUsdcMinor,
    txSignature: row.txSignature,
    failureCode: row.failureCode,
    expiresAt: row.expiresAt,
    transaction:
      row.state === "prepared" && row.signerAddress
        ? {
            message: row.message,
            requiredSigners: requiredSigners(row.message),
            signerAddress: row.signerAddress,
            lastValidBlockHeight: row.lastValidBlockHeight,
          }
        : null,
  };
}

export function serializePurchase(row: PurchaseTable): Purchase {
  return {
    ...serializeOperation(row),
    listingId: row.listingId,
    feeUsdcMinor: row.feeUsdcMinor,
  };
}

export function serializeClaim(row: ClaimTable): Claim {
  return {
    ...serializeOperation(row),
    destination: row.destination,
    assetAddress: row.assetAddress,
    usesFreeClaim: Boolean(row.usesFreeClaim),
  };
}
