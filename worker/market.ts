import type { ListingTable, PurchaseTable, GameDb } from "./db";
import type { Env } from "./env";
import { HttpError } from "./http-error";
import { parseUsdcMinor, splitPrice } from "./chain/amounts";
import { linkedWallet, marketConfig, minimumPrice } from "./chain/config";
import {
  checkSponsor,
  enforcePreparedCap,
  missingOperation,
  needsReconciliation,
  preparedOperation,
  recordPrepareAttempt,
  refreshPrepared,
  refreshSubmitted,
  submitPrepared,
} from "./chain/operations";
import {
  connectChain,
  latestBlockhash,
  requirePayoutAccounts,
  verifyMarketAccounts,
  verifyUsdcMint,
} from "./chain/rpc";
import { preparedBlockhash, toBase64 } from "./chain/signing";
import { buildPurchaseTransaction } from "./chain/transactions";
import {
  closeListings,
  ensureCardsUnlocked,
  hasProposedTrade,
} from "./card-locks";
import { setupPayouts } from "./payouts";
import { serializeListing, serializePurchase } from "./serialize";

function listingPrice(env: Env, input: string) {
  const price = parseUsdcMinor(input);
  const minimum = minimumPrice(env);
  if (price === null)
    throw new HttpError(
      400,
      "Enter a positive USDC price in minor units.",
      "INVALID_PRICE",
    );
  if (price < minimum)
    throw new HttpError(
      400,
      `The minimum price is ${minimum} USDC minor units.`,
      "PRICE_BELOW_MINIMUM",
    );
  return price;
}

function priceChanged() {
  return new HttpError(409, "The listed price changed.", "PRICE_CHANGED");
}

function listingUnavailable() {
  return new HttpError(
    409,
    "That listing is no longer available.",
    "LISTING_UNAVAILABLE",
  );
}

async function ensureNoTrade(db: GameDb, cardId: string) {
  if (await hasProposedTrade(db, cardId))
    throw new HttpError(
      409,
      "This card has a proposed trade.",
      "TRADE_PENDING",
    );
}

async function listingCard(db: GameDb, cardId: string, owner: string) {
  const card = await db
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
  if (card.ownerUserId !== owner)
    throw new HttpError(403, "You do not own this card.", "NOT_CARD_OWNER");
  if (card.status !== "claimed")
    throw new HttpError(
      409,
      "This card already lives on Solana.",
      "CARD_MINTED",
    );
  return card;
}

export async function setListing(
  db: GameDb,
  env: Env,
  input: { actorUserId: string; cardId: string; priceUsdcMinor: string | null },
) {
  const { actorUserId, cardId, priceUsdcMinor } = input;
  let payoutWallet: string | undefined;
  if (priceUsdcMinor !== null) {
    listingPrice(env, priceUsdcMinor);
    await listingCard(db, cardId, actorUserId);
    await ensureCardsUnlocked(db, [cardId], Date.now());
    await ensureNoTrade(db, cardId);
    const payout = await setupPayouts(db, env, actorUserId);
    if (payout.state === "failed")
      throw new HttpError(
        409,
        "Payout setup failed. Open a USDC payout account to list.",
        "PAYOUT_SETUP_FAILED",
      );
    if (payout.state === "submitted")
      throw new HttpError(
        409,
        "USDC payout setup is awaiting finality.",
        "PAYOUT_SETUP_PENDING",
      );
    payoutWallet = payout.walletAddress;
  }

  return db.transaction().execute(async (trx) => {
    const now = Date.now();
    const card = await listingCard(trx, cardId, actorUserId);
    await ensureCardsUnlocked(trx, [cardId], now);
    if (priceUsdcMinor === null) {
      await closeListings(trx, [cardId], now);
      return { listing: null };
    }

    await ensureNoTrade(trx, cardId);
    const seller = await trx
      .selectFrom("profiles")
      .innerJoin("user", "user.id", "profiles.userId")
      .select(["profiles.walletAddress", "user.name"])
      .where("userId", "=", actorUserId)
      .executeTakeFirst();
    if (seller?.walletAddress !== payoutWallet)
      throw new HttpError(
        409,
        "The linked wallet changed. Try again.",
        "WALLET_CHANGED",
      );

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

async function availableListing(db: GameDb, id: string, expectedPrice: string) {
  const listing = await db
    .selectFrom("listings")
    .innerJoin("cards", "cards.id", "listings.cardId")
    .selectAll("listings")
    .select(["cards.ownerUserId", "cards.status"])
    .where("listings.id", "=", id)
    .executeTakeFirst();
  if (
    !listing ||
    listing.closedAt !== null ||
    listing.status !== "claimed" ||
    listing.ownerUserId !== listing.sellerUserId
  )
    throw listingUnavailable();
  if (listing.priceUsdcMinor !== expectedPrice) throw priceChanged();
  return listing;
}

async function paymentWallets(
  db: GameDb,
  listing: ListingTable,
  buyerUserId: string,
) {
  if (listing.sellerUserId === buyerUserId)
    throw new HttpError(409, "You cannot buy your own card.", "SELF_PURCHASE");
  const profiles = await db
    .selectFrom("profiles")
    .select(["userId", "walletAddress"])
    .where("userId", "in", [buyerUserId, listing.sellerUserId])
    .execute();
  const buyer = linkedWallet(
    profiles.find((profile) => profile.userId === buyerUserId)?.walletAddress,
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
  return { buyer, seller: linkedWallet(seller) };
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
  const price = listingPrice(env, expectedPriceUsdcMinor);
  await recordPrepareAttempt(db, actorUserId);
  const findPrior = (connection: GameDb, now = Date.now()) =>
    connection
      .selectFrom("purchases")
      .selectAll()
      .where("actorUserId", "=", actorUserId)
      .where("listingId", "=", listingId)
      .where((eb) =>
        eb.or([
          eb("state", "in", ["submitted", "settled", "refund_required"]),
          eb.and([
            eb("state", "=", "prepared"),
            eb("expiresAt", ">", now),
            eb("priceUsdcMinor", "=", expectedPriceUsdcMinor),
          ]),
        ]),
      )
      .orderBy("createdAt", "desc")
      .executeTakeFirst();

  const prior = await findPrior(db);
  if (prior && prior.state !== "prepared") return serializePurchase(prior);
  if (!prior) await enforcePreparedCap(db, actorUserId, Date.now());

  const listing = await availableListing(db, listingId, expectedPriceUsdcMinor);
  await ensureCardsUnlocked(db, [listing.cardId], Date.now());
  await ensureNoTrade(db, listing.cardId);
  const wallets = await paymentWallets(db, listing, actorUserId);
  const [config, chain] = await Promise.all([
    marketConfig(env),
    connectChain(env),
  ]);
  await verifyMarketAccounts(chain, config);
  await Promise.all([
    verifyUsdcMint(chain, config.usdcMint),
    requirePayoutAccounts(chain, config, wallets.seller),
  ]);
  if (prior) await refreshPrepared(db, chain, "purchases", prior);

  const lifetime = await latestBlockhash(chain);
  const row = await db
    .transaction()
    .execute(async (trx): Promise<PurchaseTable> => {
      const now = Date.now();
      const current = await availableListing(
        trx,
        listingId,
        expectedPriceUsdcMinor,
      );
      await ensureCardsUnlocked(trx, [current.cardId], now);
      await ensureNoTrade(trx, current.cardId);
      const { buyer, seller } = await paymentWallets(trx, current, actorUserId);
      if (seller !== wallets.seller || buyer !== wallets.buyer)
        throw new HttpError(
          409,
          "A payment wallet changed. Prepare a new purchase.",
          "WALLET_CHANGED",
        );
      const existing = await findPrior(trx, now);
      if (existing) return existing;
      await enforcePreparedCap(trx, actorUserId, now);

      const id = crypto.randomUUID();
      const amounts = splitPrice(price, config.feeBps);
      const transaction = await buildPurchaseTransaction({
        id,
        lifetime,
        sponsor: config.sponsor.address,
        buyer,
        seller,
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
            cardId: current.cardId,
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
          sellerUserId: current.sellerUserId,
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
    readOnly?: boolean;
  },
) {
  const { actorUserId, id, signature, readOnly } = input;
  let row = await readPurchase(db, actorUserId, id);
  if (readOnly || (row.state !== "prepared" && !needsReconciliation(row)))
    return serializePurchase(row);

  const chain = await connectChain(env);
  if (row.state === "prepared" && signature !== undefined) {
    const price = listingPrice(env, row.priceUsdcMinor);
    const config = await marketConfig(env);
    checkSponsor(row, config.sponsor);
    const listing = await availableListing(
      db,
      row.listingId,
      row.priceUsdcMinor,
    );
    const wallets = await paymentWallets(db, listing, actorUserId);
    await verifyMarketAccounts(chain, config);
    await requirePayoutAccounts(chain, config, wallets.seller);
    await submitPrepared(
      db,
      chain,
      "purchases",
      row,
      [config.sponsor],
      env,
      signature,
      async (trx, now) => {
        const current = await availableListing(
          trx,
          row.listingId,
          row.priceUsdcMinor,
        );
        if (
          current.cardId !== row.cardId ||
          current.sellerUserId !== row.sellerUserId
        )
          throw listingUnavailable();
        await ensureCardsUnlocked(trx, [row.cardId], now);
        await ensureNoTrade(trx, row.cardId);
        const { buyer, seller } = await paymentWallets(
          trx,
          current,
          actorUserId,
        );
        if (buyer !== wallets.buyer || seller !== wallets.seller)
          throw new HttpError(
            409,
            "A payment wallet changed. Prepare a new purchase.",
            "WALLET_CHANGED",
          );
        const fee = BigInt(row.feeUsdcMinor);
        const expected = await buildPurchaseTransaction({
          id: row.id,
          lifetime: {
            blockhash: preparedBlockhash(row.message),
            lastValidBlockHeight: BigInt(row.lastValidBlockHeight),
          },
          sponsor: config.sponsor.address,
          buyer,
          seller,
          treasury: config.treasury,
          mint: config.usdcMint,
          sellerAmount: price - fee,
          fee,
        });
        if (toBase64(expected.messageBytes) !== row.message)
          throw new HttpError(
            409,
            "The payment details changed. Prepare a new purchase.",
            "PAYMENT_DETAILS_CHANGED",
          );
      },
    );
    row = await readPurchase(db, actorUserId, id);
  } else {
    await refreshPrepared(db, chain, "purchases", row);
  }
  if (needsReconciliation(row))
    await refreshSubmitted(
      db,
      chain,
      { table: "purchases", row },
      { retryBroadcast: signature === undefined },
    );
  return serializePurchase(await readPurchase(db, actorUserId, id));
}
