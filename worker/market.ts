import type { PurchaseTable, GameDb } from "./db";
import type { Env } from "./env";
import { HttpError } from "./http-error";
import { parseUsdcMinor, splitPrice } from "./chain/amounts";
import { linkedWallet, loadSigner, marketConfig } from "./chain/config";
import {
  checkSponsor,
  missingOperation,
  preparedOperation,
  refreshPrepared,
  refreshSubmitted,
  submitPrepared,
} from "./chain/operations";
import { connectChain, latestBlockhash, verifyUsdcMint } from "./chain/rpc";
import { buildPurchaseTransaction } from "./chain/transactions";
import {
  closeListings,
  ensureCardsUnlocked,
  hasProposedTrade,
  pendingStates,
} from "./card-locks";
import { serializeListing, serializePurchase } from "./serialize";

function invalidPrice() {
  return new HttpError(
    400,
    "Enter a positive USDC price in minor units.",
    "INVALID_PRICE",
  );
}

function priceChanged() {
  return new HttpError(409, "The listed price changed.", "PRICE_CHANGED");
}

function tradePending() {
  return new HttpError(409, "This card has a proposed trade.", "TRADE_PENDING");
}

export async function setListing(
  db: GameDb,
  input: {
    actorUserId: string;
    cardId: string;
    priceUsdcMinor: string | null;
  },
) {
  const { actorUserId, cardId, priceUsdcMinor } = input;
  if (priceUsdcMinor !== null && parseUsdcMinor(priceUsdcMinor) === null)
    throw invalidPrice();

  return db.transaction().execute(async (trx) => {
    const now = Date.now();
    const card = await trx
      .selectFrom("cards")
      .selectAll()
      .where("id", "=", cardId)
      .executeTakeFirst();
    if (!card)
      throw new HttpError(
        404,
        "That card is not in the archive.",
        "CARD_NOT_FOUND",
      );
    if (card.ownerUserId !== actorUserId)
      throw new HttpError(403, "You do not own this card.", "NOT_CARD_OWNER");
    if (card.status !== "claimed")
      throw new HttpError(
        409,
        "This card already lives on Solana.",
        "CARD_MINTED",
      );
    await ensureCardsUnlocked(trx, [cardId], now);
    if (priceUsdcMinor === null) {
      await closeListings(trx, [cardId], now);
      return { listing: null };
    }

    if (await hasProposedTrade(trx, cardId)) throw tradePending();
    const seller = await trx
      .selectFrom("profiles")
      .innerJoin("user", "user.id", "profiles.userId")
      .select(["profiles.walletAddress", "user.name"])
      .where("userId", "=", actorUserId)
      .executeTakeFirst();
    linkedWallet(seller?.walletAddress);

    const listing =
      (await trx
        .updateTable("listings")
        .set({ priceUsdcMinor, updatedAt: now })
        .where("cardId", "=", cardId)
        .where("sellerUserId", "=", actorUserId)
        .where("closedAt", "is", null)
        .returningAll()
        .executeTakeFirst()) ??
      (await trx
        .insertInto("listings")
        .values({
          id: crypto.randomUUID(),
          cardId,
          sellerUserId: actorUserId,
          priceUsdcMinor,
          createdAt: now,
          updatedAt: now,
          closedAt: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow());

    return {
      listing: serializeListing(listing, { ...card, ownerName: seller?.name }),
    };
  });
}

async function readPurchase(db: GameDb, actorUserId: string, id: string) {
  const row = await db
    .selectFrom("purchases")
    .selectAll()
    .where("id", "=", id)
    .where("actorUserId", "=", actorUserId)
    .executeTakeFirst();
  if (!row) throw missingOperation();
  return row;
}

export async function preparePurchase(
  db: GameDb,
  env: Env,
  input: {
    actorUserId: string;
    listingId: string;
    expectedPriceUsdcMinor: string;
  },
) {
  const { actorUserId, listingId, expectedPriceUsdcMinor } = input;
  const price = parseUsdcMinor(expectedPriceUsdcMinor);
  if (price === null) throw invalidPrice();

  const findPrior = async (connection: GameDb, now = Date.now()) => {
    const existing = await connection
      .selectFrom("purchases")
      .selectAll()
      .where("actorUserId", "=", actorUserId)
      .where("listingId", "=", listingId)
      .where((eb) =>
        eb.or([
          eb("state", "in", ["submitted", "settled"]),
          eb.and([eb("state", "=", "prepared"), eb("expiresAt", ">", now)]),
        ]),
      )
      .orderBy("createdAt", "desc")
      .executeTakeFirst();
    if (existing && existing.priceUsdcMinor !== expectedPriceUsdcMinor)
      throw priceChanged();
    return existing;
  };
  const prior = await findPrior(db);
  if (prior?.state === "settled" || prior?.state === "submitted")
    return serializePurchase(prior);

  const config = await marketConfig(env);
  const chain = await connectChain(env);
  if (prior) {
    await refreshPrepared(db, chain, "purchases", prior);
    const existing = await findPrior(db);
    if (existing) return serializePurchase(existing);
  }

  const [lifetime] = await Promise.all([
    latestBlockhash(chain),
    verifyUsdcMint(chain, config.usdcMint),
  ]);
  const row = await db
    .transaction()
    .execute(async (trx): Promise<PurchaseTable> => {
      const now = Date.now();
      const listing = await trx
        .selectFrom("listings")
        .innerJoin("cards", "cards.id", "listings.cardId")
        .selectAll("listings")
        .select(["cards.ownerUserId", "cards.status"])
        .where("listings.id", "=", listingId)
        .executeTakeFirst();

      const existing = await findPrior(trx, now);
      if (existing) return existing;

      if (
        !listing ||
        listing.closedAt !== null ||
        listing.status !== "claimed" ||
        listing.ownerUserId !== listing.sellerUserId
      ) {
        throw new HttpError(
          409,
          "That listing is no longer available.",
          "LISTING_UNAVAILABLE",
        );
      }
      if (listing.sellerUserId === actorUserId) {
        throw new HttpError(
          409,
          "You cannot buy your own card.",
          "SELF_PURCHASE",
        );
      }
      if (listing.priceUsdcMinor !== expectedPriceUsdcMinor) {
        throw priceChanged();
      }
      await ensureCardsUnlocked(trx, [listing.cardId], now);
      if (await hasProposedTrade(trx, listing.cardId)) throw tradePending();

      const profiles = await trx
        .selectFrom("profiles")
        .select(["userId", "walletAddress"])
        .where("userId", "in", [actorUserId, listing.sellerUserId])
        .execute();
      const buyer = linkedWallet(
        profiles.find((profile) => profile.userId === actorUserId)
          ?.walletAddress,
      );
      const seller = profiles.find(
        (profile) => profile.userId === listing.sellerUserId,
      )?.walletAddress;
      if (!seller)
        throw new HttpError(
          409,
          "The seller needs a linked Solana wallet.",
          "SELLER_WALLET_REQUIRED",
        );

      const id = crypto.randomUUID();
      const amounts = splitPrice(price, config.feeBps);
      const transaction = await buildPurchaseTransaction({
        id,
        lifetime,
        sponsor: config.sponsor.address,
        buyer,
        seller: linkedWallet(seller),
        treasury: config.treasury,
        mint: config.usdcMint,
        sellerAmount: amounts.seller,
        fee: amounts.fee,
      });
      return trx
        .insertInto("purchases")
        .values({
          ...preparedOperation({
            id,
            cardId: listing.cardId,
            actorUserId,
            priceUsdcMinor: expectedPriceUsdcMinor,
            sponsorAddress: config.sponsor.address,
            signerAddress: buyer,
            genesisHash: chain.genesisHash,
            transaction,
            lifetime,
            now,
          }),
          signerAddress: buyer,
          listingId,
          sellerUserId: listing.sellerUserId,
          feeUsdcMinor: amounts.fee.toString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  return serializePurchase(row);
}

export async function purchaseStatus(
  db: GameDb,
  env: Env,
  input: {
    actorUserId: string;
    id: string;
    signature?: string;
  },
) {
  const { actorUserId, id, signature } = input;
  let row = await readPurchase(db, actorUserId, id);
  if (!pendingStates.some((state) => row.state === state))
    return serializePurchase(row);

  const chain = await connectChain(env);
  if (row.state === "prepared" && signature !== undefined) {
    const sponsor = await loadSigner(env.SPONSOR_SECRET_KEY);
    checkSponsor(row, sponsor);
    await submitPrepared(db, chain, "purchases", row, [sponsor], signature);
    row = await readPurchase(db, actorUserId, id);
  } else {
    await refreshPrepared(db, chain, "purchases", row);
  }
  if (row.state === "submitted")
    await refreshSubmitted(
      db,
      chain,
      { table: "purchases", row },
      { retryBroadcast: signature === undefined },
    );
  return serializePurchase(await readPurchase(db, actorUserId, id));
}
