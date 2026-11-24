import {
  cancelProposedTrades,
  closeListings,
  ensureCardsUnlocked,
} from "./card-locks";
import type { GameDb } from "./db";
import { HttpError } from "./http-error";

export async function proposeTrade(
  db: GameDb,
  input: {
    actorUserId: string;
    offeredCardId: string;
    requestedCardId: string;
  },
) {
  const { actorUserId, offeredCardId, requestedCardId } = input;
  if (offeredCardId === requestedCardId)
    throw new HttpError(400, "A card cannot trade for itself.");

  return db.transaction().execute(async (trx) => {
    const cards = await trx
      .selectFrom("cards")
      .select(["id", "ownerUserId", "status", "forTrade"])
      .where("id", "in", [offeredCardId, requestedCardId])
      .execute();
    const offered = cards.find((card) => card.id === offeredCardId);
    const requested = cards.find((card) => card.id === requestedCardId);
    if (!offered || !requested)
      throw new HttpError(404, "One of those cards has left the archive.");
    if (offered.ownerUserId !== actorUserId)
      throw new HttpError(403, "You can only offer a card you own.");
    if (
      !requested.ownerUserId ||
      requested.ownerUserId === actorUserId ||
      !requested.forTrade
    ) {
      throw new HttpError(400, "That card is not open to offers.");
    }
    if (offered.status !== "claimed" || requested.status !== "claimed") {
      throw new HttpError(
        409,
        "Minted cards live in a wallet and cannot move in-game.",
      );
    }
    const now = Date.now();
    await ensureCardsUnlocked(trx, [offeredCardId, requestedCardId], now);

    const id = crypto.randomUUID();
    await trx
      .insertInto("trades")
      .values({
        id,
        proposerId: actorUserId,
        counterpartyId: requested.ownerUserId,
        offeredCardId,
        requestedCardId,
        status: "proposed",
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id, status: "proposed" };
  });
}

export async function decideTrade(
  db: GameDb,
  input: {
    actorUserId: string;
    tradeId: string;
    action: string;
  },
) {
  const { actorUserId, tradeId, action } = input;
  return db.transaction().execute(async (trx) => {
    const trade = await trx
      .selectFrom("trades")
      .selectAll()
      .where("id", "=", tradeId)
      .executeTakeFirst();
    if (!trade) throw new HttpError(404, "That trade has vanished.");
    if (trade.status !== "proposed")
      throw new HttpError(409, "This trade is already closed.");
    const now = Date.now();

    if (action === "decline" || action === "cancel") {
      if (action === "decline" && trade.counterpartyId !== actorUserId) {
        throw new HttpError(403, "Only the recipient can decline this offer.");
      }
      if (action === "cancel" && trade.proposerId !== actorUserId) {
        throw new HttpError(403, "Only the proposer can cancel this offer.");
      }
      const status = action === "decline" ? "declined" : "cancelled";
      await trx
        .updateTable("trades")
        .set({ status, updatedAt: now })
        .where("id", "=", tradeId)
        .execute();
      return { ok: true, status };
    }

    if (trade.counterpartyId !== actorUserId)
      throw new HttpError(403, "Only the recipient can accept this trade.");
    const cardIds = [trade.offeredCardId, trade.requestedCardId];
    await ensureCardsUnlocked(trx, cardIds, now);
    const cards = await trx
      .selectFrom("cards")
      .select(["id", "ownerUserId", "status"])
      .where("id", "in", cardIds)
      .execute();
    const offered = cards.find((card) => card.id === trade.offeredCardId);
    const requested = cards.find((card) => card.id === trade.requestedCardId);
    if (!offered || !requested)
      throw new HttpError(404, "One of the cards is no longer available.");
    if (
      offered.ownerUserId !== trade.proposerId ||
      requested.ownerUserId !== trade.counterpartyId ||
      offered.status !== "claimed" ||
      requested.status !== "claimed"
    ) {
      throw new HttpError(409, "Ownership changed since this offer was made.");
    }

    await trx
      .updateTable("cards")
      .set({ ownerUserId: trade.counterpartyId, forTrade: 0 })
      .where("id", "=", offered.id)
      .execute();
    await trx
      .updateTable("cards")
      .set({ ownerUserId: trade.proposerId, forTrade: 0 })
      .where("id", "=", requested.id)
      .execute();
    await trx
      .updateTable("trades")
      .set({ status: "settled", updatedAt: now })
      .where("id", "=", tradeId)
      .execute();
    await closeListings(trx, cardIds, now);
    await cancelProposedTrades(trx, cardIds, now);
    return { ok: true, status: "settled" };
  });
}
