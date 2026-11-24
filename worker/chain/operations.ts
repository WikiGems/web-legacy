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
  type OperationTable,
} from "../card-locks";
import { HttpError } from "../http-error";
import { chainNotConfigured, type ServerSigner } from "./config";
import {
  broadcast,
  chainOutcome,
  chainRequest,
  ensureSameChain,
  rpcOptions,
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
  };
}

type Outcome = "settled" | "failed" | "expired";
const failureCodes = {
  settled: null,
  failed: "TRANSACTION_FAILED",
  expired: "TRANSACTION_EXPIRED",
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
  clientSignature?: string,
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
  const signed = await signPreparedMessage(row, signers, clientSignature, {
    now,
    blockHeight,
    blockhashValid,
  });

  const changed = await db
    .updateTable(table)
    .set({ ...signed, state: "submitted", updatedAt: Date.now() })
    .where("id", "=", row.id)
    .where("state", "=", "prepared")
    .where("expiresAt", ">", Date.now())
    .returning("id")
    .executeTakeFirst();

  // Persist the exact signed wire and its transaction ID before any broadcast.
  if (changed) await tryBroadcast(chain, signed.signedTransaction);
  else if (Date.now() >= row.expiresAt)
    await expirePrepared(db, table, row.id, Date.now());
}

async function tryBroadcast(
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

async function settle(db: GameDb, job: ChainJob, outcome: Outcome) {
  const { table, row } = job;
  await db.transaction().execute(async (trx) => {
    const now = Date.now();
    const updated = await trx
      .updateTable(table)
      .set({
        state: outcome,
        failureCode: failureCodes[outcome],
        updatedAt: now,
      })
      .where("id", "=", row.id)
      .where("state", "=", "submitted")
      .where("txSignature", "=", row.txSignature)
      .returning("id")
      .executeTakeFirst();
    if (!updated || outcome !== "settled") return;

    let card: { id: string } | undefined;
    if (job.table === "purchases") {
      const purchase = job.row;
      const buyer = await trx
        .selectFrom("user")
        .select("id")
        .where("id", "=", purchase.actorUserId)
        .executeTakeFirst();
      card = await trx
        .updateTable("cards")
        .set({ ownerUserId: buyer?.id ?? null, forTrade: 0 })
        .where("id", "=", purchase.cardId)
        .where("status", "=", "claimed")
        .where((eb) =>
          eb.or([
            eb("ownerUserId", "=", purchase.sellerUserId),
            eb("ownerUserId", "is", null),
          ]),
        )
        .returning("id")
        .executeTakeFirst();
    } else {
      const claim = job.row;
      card = await trx
        .updateTable("cards")
        .set({
          status: "minted",
          mintAddress: claim.assetAddress,
          ownerWallet: claim.destination,
          ownerUserId: await ownerOfWallet(trx, claim.destination),
          txSignature: claim.txSignature,
          mintedAt: now,
          forTrade: 0,
        })
        .where("id", "=", claim.cardId)
        .where("status", "=", "claimed")
        .where((eb) =>
          eb.or([
            eb("ownerUserId", "=", claim.actorUserId),
            eb("ownerUserId", "is", null),
          ]),
        )
        .returning("id")
        .executeTakeFirst();
    }
    if (!card)
      throw new Error("Card ownership changed during a submitted operation.");

    await closeListings(trx, [card.id], now);
    await cancelProposedTrades(trx, [card.id], now);
  });
}

export async function refreshSubmitted(
  db: GameDb,
  chain: Chain,
  job: ChainJob,
  options?: { finalizedHeight?: bigint; retryBroadcast: boolean },
) {
  if (job.row.state !== "submitted") return;
  const outcome = await chainOutcome(chain, job.row, options?.finalizedHeight);
  switch (outcome) {
    case "unseen":
      if (options?.retryBroadcast !== false)
        await tryBroadcast(chain, storedWire(job.row));
      break;
    case "pending":
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
