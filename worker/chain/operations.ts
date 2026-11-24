import type { BlockhashLifetimeConstraint, Transaction } from "@solana/kit";
import type {
  ChainOperationTable,
  ClaimTable,
  GameDb,
  PurchaseTable,
} from "../db";
import {
  LOCK_MS,
  cancelProposedTrades,
  closeListings,
  ensureCardsUnlocked,
  hasProposedTrade,
  type OperationTable,
} from "../card-locks";
import type { Env } from "../env";
import { HttpError } from "../http-error";
import { chainNotConfigured, type ServerSigner } from "./config";
import {
  broadcast,
  chainOutcome,
  chainRequest,
  ensureSameChain,
  rpcOptions,
  requireSponsorBalance,
  storedWire,
  type Chain,
} from "./rpc";
import {
  preparedBlockhash,
  preparedExpired,
  signPreparedMessage,
  toBase64,
} from "./signing";

export function preparedOperation(input: {
  id: string;
  cardId: string;
  actorUserId: string;
  priceUsdcMinor: string;
  sponsorAddress: string;
  signerAddress: string | null;
  genesisHash: string;
  transaction: Transaction;
  lifetime: BlockhashLifetimeConstraint;
  now: number;
}): ChainOperationTable {
  const { transaction, lifetime, now, ...fields } = input;
  return {
    ...fields,
    message: toBase64(transaction.messageBytes),
    lastValidBlockHeight: lifetime.lastValidBlockHeight.toString(),
    state: "prepared",
    txSignature: null,
    signedTransaction: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + LOCK_MS,
    notFoundChecks: 0,
    firstNotFoundAt: null,
    lastNotFoundAt: null,
    expiredAt: null,
  };
}

type Outcome = "settled" | "failed" | "expired" | "refund_required";
const NOT_FOUND_INTERVAL_MS = 15 * 60_000;
export const LATE_RECONCILIATION_MS = 7 * 24 * 60 * 60_000;
const MAX_PREPARED = 3;
const MAX_PREPARES_PER_MINUTE = 12;

function prepareLimit() {
  return new HttpError(
    429,
    "Too many transaction prepares. Try again shortly.",
    "PREPARE_LIMIT",
  );
}

export async function recordPrepareAttempt(db: GameDb, actorUserId: string) {
  await db.transaction().execute(async (trx) => {
    const now = Date.now();
    const { count } = await trx
      .selectFrom("chain_prepare_attempts")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("actorUserId", "=", actorUserId)
      .where("createdAt", ">", now - 60_000)
      .executeTakeFirstOrThrow();
    if (Number(count) >= MAX_PREPARES_PER_MINUTE) throw prepareLimit();
    await trx
      .insertInto("chain_prepare_attempts")
      .values({ actorUserId, createdAt: now })
      .execute();
  });
}

export async function enforcePreparedCap(
  db: GameDb,
  actorUserId: string,
  now: number,
) {
  let prepared = 0;
  for (const table of ["purchases", "claims"] as const) {
    const rows = await db
      .selectFrom(table)
      .select("id")
      .where("actorUserId", "=", actorUserId)
      .where("state", "=", "prepared")
      .where("expiresAt", ">", now)
      .limit(MAX_PREPARED)
      .execute();
    prepared += rows.length;
  }
  if (prepared >= MAX_PREPARED) throw prepareLimit();
}

const failureCodes = {
  settled: null,
  failed: "TRANSACTION_FAILED",
  expired: "TRANSACTION_EXPIRED",
  refund_required: "REFUND_REQUIRED",
};

function expirePrepared(
  db: GameDb,
  table: OperationTable,
  id: string,
  now: number,
) {
  return db
    .updateTable(table)
    .set({
      state: "expired",
      failureCode: failureCodes.expired,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("state", "=", "prepared")
    .execute();
}

export async function refreshPrepared(
  db: GameDb,
  chain: Chain,
  table: OperationTable,
  row: ChainOperationTable,
  height?: bigint,
) {
  if (row.state !== "prepared") return;
  const now = Date.now();
  if (now >= row.expiresAt) {
    await expirePrepared(db, table, row.id, now);
    return;
  }
  ensureSameChain(chain, row);
  const blockHeight =
    height ??
    (await chainRequest(() =>
      chain.rpc.getBlockHeight({ commitment: "confirmed" }).send(rpcOptions()),
    ));
  if (preparedExpired(row, now, blockHeight))
    await expirePrepared(db, table, row.id, now);
}

export async function submitPrepared(
  db: GameDb,
  chain: Chain,
  table: OperationTable,
  row: ChainOperationTable,
  signers: ServerSigner[],
  env: Env,
  clientSignature?: string,
  beforeSign?: (trx: GameDb, now: number) => Promise<void>,
) {
  if (row.state !== "prepared") return;
  ensureSameChain(chain, row);
  const [blockHeight, { value: blockhashValid }] = await chainRequest(() =>
    Promise.all([
      chain.rpc.getBlockHeight({ commitment: "confirmed" }).send(rpcOptions()),
      chain.rpc
        .isBlockhashValid(preparedBlockhash(row.message), {
          commitment: "confirmed",
        })
        .send(rpcOptions()),
    ]),
  );
  const now = Date.now();
  if (preparedExpired(row, now, blockHeight)) {
    await expirePrepared(db, table, row.id, now);
    return;
  }
  if (!blockhashValid) {
    await expirePrepared(db, table, row.id, now);
    throw new HttpError(
      409,
      "Prepare a new transaction.",
      "TRANSACTION_EXPIRED",
    );
  }
  const sponsor = signers[0];
  if (!sponsor) throw chainNotConfigured();
  await requireSponsorBalance(chain, env, sponsor.address);

  const signed = await db.transaction().execute(async (trx) => {
    const signingAt = Date.now();
    const current = await trx
      .selectFrom(table)
      .select("state")
      .where("id", "=", row.id)
      .executeTakeFirst();
    if (current?.state !== "prepared") return;
    if (signingAt >= row.expiresAt) {
      await expirePrepared(trx, table, row.id, signingAt);
      return;
    }
    await beforeSign?.(trx, signingAt);
    const wire = await signPreparedMessage(row, signers, clientSignature, {
      now: signingAt,
      blockHeight,
      blockhashValid,
    });
    await trx
      .updateTable(table)
      .set({
        ...wire,
        state: "submitted",
        updatedAt: signingAt,
      })
      .where("id", "=", row.id)
      .execute();
    return wire;
  });

  // Persist the exact signed wire and its transaction ID before any broadcast.
  if (signed) await tryBroadcast(chain, signed.signedTransaction);
}

export async function tryBroadcast(
  chain: Chain,
  wire: Parameters<typeof broadcast>[1],
) {
  try {
    await broadcast(chain, wire);
  } catch {
    // A timeout or preflight error does not prove that the wire never landed.
    // Keep it submitted until finality or expiry resolves the outcome.
  }
}

async function ownerOfWallet(db: GameDb, wallet: string | null) {
  if (!wallet) return null;
  const matches = await db
    .selectFrom("profiles")
    .select("userId")
    .where("walletAddress", "=", wallet)
    .limit(2)
    .execute();
  return matches.length === 1 ? (matches[0]?.userId ?? null) : null;
}

type ChainJob =
  | { table: "purchases"; row: PurchaseTable }
  | { table: "claims"; row: ClaimTable };

async function settle(
  db: GameDb,
  job: ChainJob,
  finalized: "settled" | "failed",
) {
  const { table, row } = job;
  const outcome = await db.transaction().execute(async (trx) => {
    const now = Date.now();
    const current = await trx
      .selectFrom(table)
      .select(["state", "expiredAt"])
      .where("id", "=", row.id)
      .where("txSignature", "=", row.txSignature)
      .executeTakeFirst();
    const late =
      current?.state === "expired" &&
      current.expiredAt !== null &&
      current.expiredAt > now - LATE_RECONCILIATION_MS;
    if (current?.state !== "submitted" && !late) return;

    let result: Outcome = finalized;
    if (finalized === "settled") {
      if (late) {
        try {
          await ensureCardsUnlocked(trx, [row.cardId], now);
          if (await hasProposedTrade(trx, row.cardId))
            result = "refund_required";
        } catch (error) {
          if (!(error instanceof HttpError) || error.code !== "CARD_LOCKED")
            throw error;
          result = "refund_required";
        }
      }

      if (result === "settled") {
        const card = await deliverCard(trx, job, now, late);
        if (card) {
          await closeListings(trx, [row.cardId], now);
          await cancelProposedTrades(trx, [row.cardId], now);
        } else {
          result = "refund_required";
        }
      }
    }

    await trx
      .updateTable(table)
      .set({
        state: result,
        failureCode: failureCodes[result],
        updatedAt: now,
      })
      .where("id", "=", row.id)
      .execute();
    return result;
  });
  if (outcome === "refund_required") {
    console.error(
      "Finalized chain operation requires operator reconciliation",
      {
        table,
        id: row.id,
        cardId: row.cardId,
        txSignature: row.txSignature,
      },
    );
  }
}

async function deliverCard(
  db: GameDb,
  job: ChainJob,
  now: number,
  late: boolean,
) {
  const { row } = job;
  const originalOwner =
    job.table === "purchases" ? job.row.sellerUserId : job.row.actorUserId;
  const card = db
    .updateTable("cards")
    .where("id", "=", row.cardId)
    .where("status", "=", "claimed")
    .where((eb) =>
      late
        ? eb("ownerUserId", "=", originalOwner)
        : eb.or([
            eb("ownerUserId", "=", originalOwner),
            eb("ownerUserId", "is", null),
          ]),
    )
    .returning("id");

  if (job.table === "purchases") {
    const buyer = await db
      .selectFrom("user")
      .select("id")
      .where("id", "=", row.actorUserId)
      .executeTakeFirst();
    if (late && !buyer) return;
    return card
      .set({ ownerUserId: buyer?.id ?? null, forTrade: 0 })
      .executeTakeFirst();
  }
  const claim = job.row;
  return card
    .set({
      status: "minted",
      mintAddress: claim.assetAddress,
      ownerWallet: claim.destination,
      ownerUserId: await ownerOfWallet(db, claim.destination),
      txSignature: claim.txSignature,
      mintedAt: now,
      forTrade: 0,
    })
    .executeTakeFirst();
}

async function recordNotFound(db: GameDb, { table, row }: ChainJob) {
  const now = Date.now();
  const checks = row.notFoundChecks + 1;
  const first = row.firstNotFoundAt ?? now;
  const expired = checks >= 3 && now - first >= 2 * NOT_FOUND_INTERVAL_MS;
  await db
    .updateTable(table)
    .set({
      notFoundChecks: checks,
      firstNotFoundAt: first,
      lastNotFoundAt: now,
      ...(expired
        ? {
            state: "expired",
            expiredAt: now,
            failureCode: failureCodes.expired,
            updatedAt: now,
          }
        : {}),
    })
    .where("id", "=", row.id)
    .where("state", "=", "submitted")
    .where("notFoundChecks", "=", row.notFoundChecks)
    .where("firstNotFoundAt", "is", row.firstNotFoundAt)
    .where((eb) =>
      eb.or([
        eb("lastNotFoundAt", "is", null),
        eb("lastNotFoundAt", "<=", now - NOT_FOUND_INTERVAL_MS),
      ]),
    )
    .execute();
}

export function needsReconciliation(
  row: ChainOperationTable,
  now = Date.now(),
) {
  return (
    row.state === "submitted" ||
    (row.state === "expired" &&
      row.expiredAt !== null &&
      row.expiredAt > now - LATE_RECONCILIATION_MS)
  );
}

export async function refreshSubmitted(
  db: GameDb,
  chain: Chain,
  job: ChainJob,
  options?: { finalizedHeight?: bigint; retryBroadcast: boolean },
) {
  const { table, row } = job;
  if (!needsReconciliation(row)) return;
  const outcome = await chainOutcome(chain, row, options?.finalizedHeight);
  switch (outcome) {
    case "unseen":
      if (row.state === "submitted" && options?.retryBroadcast !== false)
        await tryBroadcast(chain, storedWire(row));
      break;
    case "not_found":
      if (row.state === "submitted") await recordNotFound(db, job);
      break;
    case "pending":
      if (row.state === "submitted") {
        await db
          .updateTable(table)
          .set({
            notFoundChecks: 0,
            firstNotFoundAt: null,
            lastNotFoundAt: null,
          })
          .where("id", "=", row.id)
          .where("state", "=", "submitted")
          .execute();
      }
      break;
    case "unseen_past_lifetime":
      break;
    default:
      await settle(db, job, outcome);
  }
}

export function checkSponsor(row: ChainOperationTable, sponsor: ServerSigner) {
  if (sponsor.address !== row.sponsorAddress) throw chainNotConfigured();
}

export function missingOperation() {
  return new HttpError(
    404,
    "That transaction is not in the archive.",
    "OPERATION_NOT_FOUND",
  );
}
