import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Env } from "./env";

export interface ProfileTable {
  userId: string;
  walletAddress: string | null;
  walletNonce: string | null;
  walletNonceExpiresAt: number | null;
  packStock: number;
  lastPackAt: number;
  duelWins: number;
  duelLosses: number;
  createdAt: number;
  updatedAt: number;
}

export interface PackTable {
  id: string;
  userId: string;
  cardCount: number;
  createdAt: number;
}

export interface CardTable {
  id: string;
  articleId: string;
  title: string;
  description: string;
  extract: string;
  imageUrl: string | null;
  articleUrl: string;
  category: string;
  rarity: string;
  attack: number;
  defense: number;
  pageviews: number;
  status: string;
  mintAddress: string | null;
  txSignature: string | null;
  ownerWallet: string | null;
  ownerUserId: string;
  packId: string | null;
  forTrade: number;
  createdAt: number;
  mintedAt: number | null;
}

export interface TradeTable {
  id: string;
  proposerId: string;
  counterpartyId: string;
  offeredCardId: string;
  requestedCardId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserTable {
  id: string;
  name: string;
  email: string;
}

export interface Database {
  profiles: ProfileTable;
  packs: PackTable;
  cards: CardTable;
  trades: TradeTable;
  user: UserTable;
}

export function createDb(env: Pick<Env, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN">) {
  return new Kysely<Database>({
    dialect: new LibsqlDialect({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    }),
  });
}
