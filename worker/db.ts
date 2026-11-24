import { Kysely, type Generated, type GeneratedAlways } from "kysely";
import type { ChainOperationState } from "../shared/domain";
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
  gemId: GeneratedAlways<number>;
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
  ownerUserId: string | null;
  packId: string | null;
  forTrade: number;
  createdAt: number;
  mintedAt: number | null;
  ownerCheckedAt: Generated<number>;
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

export interface ListingTable {
  id: string;
  cardId: string;
  sellerUserId: string;
  priceUsdcMinor: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export interface ChainOperationTable {
  id: string;
  cardId: string;
  actorUserId: string;
  priceUsdcMinor: string;
  state: ChainOperationState;
  message: string;
  lastValidBlockHeight: string;
  genesisHash: string;
  sponsorAddress: string;
  signerAddress: string | null;
  txSignature: string | null;
  signedTransaction: string | null;
  failureCode: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  notFoundChecks: number;
  firstNotFoundAt: number | null;
  lastNotFoundAt: number | null;
  expiredAt: number | null;
}

export interface PurchaseTable extends ChainOperationTable {
  signerAddress: string;
  listingId: string;
  sellerUserId: string;
  feeUsdcMinor: string;
}

export interface ClaimTable extends ChainOperationTable {
  destination: string;
  assetAddress: string;
  mintAuthorityAddress: string;
  usesFreeClaim: 0 | 1;
}

export interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  image: string | null;
}

export interface PayoutSetupTable {
  userId: string;
  walletAddress: string;
  ataAddress: string;
  message: string | null;
  readyAt: number | null;
  genesisHash: string;
  txSignature: string | null;
  signedTransaction: string | null;
  lastValidBlockHeight: string | null;
}

export interface Database {
  payout_setups: PayoutSetupTable;
  chain_prepare_attempts: {
    id: GeneratedAlways<number>;
    actorUserId: string;
    createdAt: number;
  };
  account_profiles: {
    userId: string;
    username: string | null;
    xHandle: string | null;
    avatarKey: string | null;
  };
  avatar_cleanup: {
    objectKey: string;
    notBefore: number;
  };
  wallet_vaults: {
    userId: string;
    publicKey: string;
    prfSalt: string;
    exportedAt: number | null;
  };
  wallet_vault_wrappers: {
    userId: string;
    credentialId: string;
    version: 1;
    iv: string;
    ciphertext: string;
    createdAt: number;
  };
  profiles: ProfileTable;
  packs: PackTable;
  cards: CardTable;
  trades: TradeTable;
  listings: ListingTable;
  purchases: PurchaseTable;
  claims: ClaimTable;
  user: UserTable;
}

export function createDb(
  env: Pick<Env, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN">,
) {
  return new Kysely<Database>({
    dialect: new LibsqlDialect({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    }),
  });
}

export type GameDb = ReturnType<typeof createDb>;
