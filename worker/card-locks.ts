import { sql, type SqlBool } from "kysely";
import type { GameDb } from "./db";
import { HttpError } from "./http-error";

export const pendingStates = ["prepared", "submitted"] as const;
export const LOCK_MS = 120_000;
export type OperationTable = "purchases" | "claims";

async function releaseExpiredCardLocks(
  db: GameDb,
  cardIds: string[],
  now: number,
) {
  for (const table of ["purchases", "claims"] as const) {
    await db
      .updateTable(table)
      .set({
        state: "expired",
        failureCode: "TRANSACTION_EXPIRED",
        updatedAt: now,
      })
      .where("cardId", "in", cardIds)
      .where("state", "=", "prepared")
      .where("expiresAt", "<=", now)
      .execute();
  }
}

export function cardBusy() {
  return new HttpError(
    409,
    "This card has a pending purchase or claim.",
    "CARD_LOCKED",
  );
}

export async function ensureCardsUnlocked(
  db: GameDb,
  cardIds: string[],
  now: number,
) {
  await releaseExpiredCardLocks(db, cardIds, now);
  for (const table of ["purchases", "claims"] as const) {
    const active = await db
      .selectFrom(table)
      .select("id")
      .where("cardId", "in", cardIds)
      .where("state", "in", pendingStates)
      .executeTakeFirst();
    if (active) throw cardBusy();
  }
}

function proposedTrades(db: GameDb) {
  return db
    .selectFrom("trades as proposed")
    .innerJoin("cards as offered", "offered.id", "proposed.offeredCardId")
    .innerJoin("cards as requested", "requested.id", "proposed.requestedCardId")
    .select("proposed.id")
    .where("proposed.status", "=", "proposed")
    .where("offered.status", "=", "claimed")
    .where("requested.status", "=", "claimed")
    .whereRef("offered.ownerUserId", "=", "proposed.proposerId")
    .whereRef("requested.ownerUserId", "=", "proposed.counterpartyId");
}

export function hasProposedTrade(db: GameDb, cardId: string) {
  return proposedTrades(db)
    .where((eb) =>
      eb.or([
        eb("proposed.offeredCardId", "=", cardId),
        eb("proposed.requestedCardId", "=", cardId),
      ]),
    )
    .executeTakeFirst();
}

export async function closeListings(
  db: GameDb,
  cardIds: string[],
  now: number,
) {
  await db
    .updateTable("listings")
    .set({ closedAt: now, updatedAt: now })
    .where("cardId", "in", cardIds)
    .where("closedAt", "is", null)
    .execute();
}

export async function cancelProposedTrades(
  db: GameDb,
  cardIds: string[],
  now: number,
) {
  await db
    .updateTable("trades")
    .set({ status: "cancelled", updatedAt: now })
    .where("status", "=", "proposed")
    .where((eb) =>
      eb.or([
        eb("offeredCardId", "in", cardIds),
        eb("requestedCardId", "in", cardIds),
      ]),
    )
    .execute();
}

export function marketCardAvailable(db: GameDb, now: number) {
  const proposed = proposedTrades(db).where(
    sql<SqlBool>`(proposed.offeredCardId = c.id or proposed.requestedCardId = c.id)`,
  );
  return sql<SqlBool>`
    not exists (
      select 1 from purchases where purchases.cardId = c.id
        and (state = 'submitted' or (state = 'prepared' and expiresAt > ${now}))
    )
    and not exists (
      select 1 from claims where claims.cardId = c.id
        and (state = 'submitted' or (state = 'prepared' and expiresAt > ${now}))
    )
    and not exists ${proposed}
  `;
}
