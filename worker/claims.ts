import { isAddress } from "@solana/kit";
import { cardBusy, ensureCardsUnlocked, pendingStates } from "./card-locks";
import {
  chainNotConfigured,
  claimConfig,
  linkedWallet,
  loadSigner,
} from "./chain/config";
import {
  checkSponsor,
  missingOperation,
  preparedOperation,
  refreshPrepared,
  refreshSubmitted,
  submitPrepared,
} from "./chain/operations";
import {
  connectChain,
  latestBlockhash,
  readMintCollection,
  verifyUsdcMint,
} from "./chain/rpc";
import { buildClaimTransaction } from "./chain/transactions";
import type { ClaimTable, GameDb } from "./db";
import type { Env } from "./env";
import { HttpError } from "./http-error";
import { serializeClaim } from "./serialize";

async function readClaim(db: GameDb, actorUserId: string, id: string) {
  const row = await db
    .selectFrom("claims")
    .selectAll()
    .where("id", "=", id)
    .where("actorUserId", "=", actorUserId)
    .executeTakeFirst();
  if (!row) throw missingOperation();
  return row;
}

function checkDestination(prior: ClaimTable, destination: string | undefined) {
  if (destination !== undefined && prior.destination !== destination)
    throw cardBusy();
}

export async function prepareClaim(
  db: GameDb,
  env: Env,
  input: {
    actorUserId: string;
    cardId: string;
    destination?: string;
  },
) {
  const { actorUserId, cardId, destination } = input;
  if (destination !== undefined && !isAddress(destination)) {
    throw new HttpError(
      400,
      "Enter a valid Solana address.",
      "INVALID_DESTINATION",
    );
  }

  const findPrior = (connection: GameDb, now = Date.now()) =>
    connection
      .selectFrom("claims")
      .selectAll()
      .where("actorUserId", "=", actorUserId)
      .where("cardId", "=", cardId)
      .where((eb) =>
        eb.or([
          eb("state", "in", ["submitted", "settled"]),
          eb.and([eb("state", "=", "prepared"), eb("expiresAt", ">", now)]),
        ]),
      )
      .executeTakeFirst();

  const prior = await findPrior(db);
  if (prior?.state === "submitted" || prior?.state === "settled") {
    checkDestination(prior, destination);
    return serializeClaim(prior);
  }
  const config = await claimConfig(env);
  const chain = await connectChain(env);
  if (prior) await refreshPrepared(db, chain, "claims", prior);
  const [lifetime, collection] = await Promise.all([
    latestBlockhash(chain),
    readMintCollection(chain, config),
    verifyUsdcMint(chain, config.usdcMint),
  ]);

  const row = await db
    .transaction()
    .execute(async (trx): Promise<ClaimTable> => {
      const now = Date.now();
      const existing = await findPrior(trx, now);
      if (existing) {
        checkDestination(existing, destination);
        return existing;
      }

      const card = await trx
        .selectFrom("cards")
        .select(["status", "ownerUserId", "gemId", "title"])
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
      const player = await trx
        .selectFrom("user")
        .leftJoin("profiles", "profiles.userId", "user.id")
        .select(["user.emailVerified", "profiles.walletAddress"])
        .where("user.id", "=", actorUserId)
        .executeTakeFirstOrThrow();
      const owner = destination ?? linkedWallet(player.walletAddress);

      const used = await trx
        .selectFrom("claims")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("actorUserId", "=", actorUserId)
        .where("usesFreeClaim", "=", 1)
        .where((eb) =>
          eb.or([
            eb("state", "in", ["submitted", "settled"]),
            eb.and([eb("state", "=", "prepared"), eb("expiresAt", ">", now)]),
          ]),
        )
        .executeTakeFirstOrThrow();
      const usesFreeClaim =
        Boolean(player.emailVerified) &&
        Number(used.count) < config.freeClaimsPerUser;
      const price = usesFreeClaim ? 0n : config.price;
      const buyer = price === 0n ? null : linkedWallet(player.walletAddress);
      const id = crypto.randomUUID();
      const built = await buildClaimTransaction({
        id,
        lifetime,
        sponsor: config.sponsor.address,
        mintAuthority: config.mintAuthority.address,
        programAddress: config.programAddress,
        collection,
        destination: owner,
        gemId: card.gemId,
        title: card.title,
        origin: config.origin,
        payment: buyer
          ? {
              buyer,
              treasury: config.treasury,
              mint: config.usdcMint,
              amount: price,
            }
          : null,
      });

      return trx
        .insertInto("claims")
        .values({
          ...preparedOperation({
            id,
            cardId,
            actorUserId,
            priceUsdcMinor: price.toString(),
            sponsorAddress: config.sponsor.address,
            signerAddress: buyer,
            genesisHash: chain.genesisHash,
            transaction: built.transaction,
            lifetime,
            now,
          }),
          assetAddress: built.assetAddress,
          destination: owner,
          mintAuthorityAddress: config.mintAuthority.address,
          usesFreeClaim: usesFreeClaim ? 1 : 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });

  if (row.state === "prepared" && !row.signerAddress) {
    if (config.mintAuthority.address !== row.mintAuthorityAddress)
      throw chainNotConfigured();
    checkSponsor(row, config.sponsor);
    await submitPrepared(db, chain, "claims", row, [
      config.sponsor,
      config.mintAuthority,
    ]);
    return serializeClaim(await readClaim(db, actorUserId, row.id));
  }
  return serializeClaim(row);
}

export async function claimStatus(
  db: GameDb,
  env: Env,
  input: {
    actorUserId: string;
    id: string;
    signature?: string;
  },
) {
  const { actorUserId, id, signature } = input;
  let row = await readClaim(db, actorUserId, id);
  if (!pendingStates.some((state) => row.state === state))
    return serializeClaim(row);

  const chain = await connectChain(env);
  if (row.state === "prepared" && signature !== undefined) {
    if (!row.signerAddress)
      throw new HttpError(
        409,
        "This claim needs no wallet signature.",
        "SIGNATURE_NOT_REQUIRED",
      );
    const [sponsor, mintAuthority] = await Promise.all([
      loadSigner(env.SPONSOR_SECRET_KEY),
      loadSigner(env.MINT_AUTHORITY_SECRET_KEY),
    ]);
    checkSponsor(row, sponsor);
    if (mintAuthority.address !== row.mintAuthorityAddress)
      throw chainNotConfigured();
    await submitPrepared(
      db,
      chain,
      "claims",
      row,
      [sponsor, mintAuthority],
      signature,
    );
    row = await readClaim(db, actorUserId, id);
  } else {
    await refreshPrepared(db, chain, "claims", row);
  }
  if (row.state === "submitted")
    await refreshSubmitted(
      db,
      chain,
      { table: "claims", row },
      { retryBroadcast: signature === undefined },
    );
  return serializeClaim(await readClaim(db, actorUserId, id));
}
