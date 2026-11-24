import { isAddress } from "@solana/kit";
import { sql } from "kysely";
import type { GameDb } from "../db";
import { createDb } from "../db";
import type { Env } from "../env";
import { refreshSubmitted } from "./operations";
import {
  chainRequest,
  connectChain,
  coreOwners,
  rpcOptions,
  type Chain,
} from "./rpc";

const OPERATION_BATCH = 8;
const OWNER_BATCH = 50;

async function refreshMintedOwners(db: GameDb, chain: Chain) {
  const cards = await db
    .selectFrom("cards")
    .leftJoin("claims", (join) =>
      join
        .onRef("claims.cardId", "=", "cards.id")
        .on("claims.state", "=", "settled"),
    )
    .select(["cards.id", "cards.mintAddress", "cards.ownerCheckedAt"])
    .where("cards.status", "=", "minted")
    .where("cards.mintAddress", "is not", null)
    .where((eb) =>
      eb.or([
        eb("claims.genesisHash", "is", null),
        eb("claims.genesisHash", "=", chain.genesisHash),
      ]),
    )
    .orderBy("cards.ownerCheckedAt")
    .orderBy("cards.gemId")
    .limit(OWNER_BATCH)
    .execute();
  if (!cards.length) return;

  const checkedAt = Date.now();
  const assets = cards
    .map((card) => card.mintAddress)
    .filter((value) => value !== null && isAddress(value));
  const owners = assets.length ? await coreOwners(chain, assets) : [];
  const wallets = new Map(
    assets.map((asset, index) => [asset, owners[index] ?? null]),
  );
  const rows = cards.map(
    (card) =>
      sql`(${card.id}, ${card.mintAddress}, ${card.ownerCheckedAt}, ${card.mintAddress && isAddress(card.mintAddress) ? (wallets.get(card.mintAddress) ?? null) : null})`,
  );

  await sql`
    with refreshed(id, mintAddress, previousCheck, wallet) as (values ${sql.join(rows)})
    update cards
    set ownerWallet = refreshed.wallet,
        ownerUserId = (
          select case when count(*) = 1 then min(userId) end
          from profiles where walletAddress = refreshed.wallet
        ),
        ownerCheckedAt = ${checkedAt}
    from refreshed
    where cards.id = refreshed.id and cards.status = 'minted'
      and cards.mintAddress = refreshed.mintAddress and cards.ownerCheckedAt = refreshed.previousCheck
  `.execute(db);
}

export async function reconcileChain(env: Env) {
  const db = createDb(env);
  try {
    const now = Date.now();
    for (const table of ["purchases", "claims"] as const) {
      await db
        .updateTable(table)
        .set({
          state: "expired",
          failureCode: "TRANSACTION_EXPIRED",
          updatedAt: now,
        })
        .where("state", "=", "prepared")
        .where("expiresAt", "<=", now)
        .execute();
    }

    const [purchases, claims, minted] = await Promise.all([
      db
        .selectFrom("purchases")
        .selectAll()
        .where("state", "=", "submitted")
        .orderBy("updatedAt")
        .limit(OPERATION_BATCH)
        .execute(),
      db
        .selectFrom("claims")
        .selectAll()
        .where("state", "=", "submitted")
        .orderBy("updatedAt")
        .limit(OPERATION_BATCH)
        .execute(),
      db
        .selectFrom("cards")
        .select("id")
        .where("status", "=", "minted")
        .limit(1)
        .executeTakeFirst(),
    ]);
    if (!purchases.length && !claims.length && !minted) return;

    const chain = await connectChain(env);
    if (purchases.length || claims.length) {
      const finalizedHeight = await chainRequest(() =>
        chain.rpc
          .getBlockHeight({
            commitment: "finalized",
          })
          .send(rpcOptions()),
      );
      // Keep per-run work bounded. Revisit unresolved jobs after newer jobs get a turn.
      for (const job of [
        ...purchases.map((row) => ({ table: "purchases" as const, row })),
        ...claims.map((row) => ({ table: "claims" as const, row })),
      ]) {
        try {
          await refreshSubmitted(db, chain, job, {
            finalizedHeight,
            retryBroadcast: true,
          });
        } catch {
          console.error("Chain reconciliation deferred", {
            table: job.table,
            id: job.row.id,
          });
        }
        await db
          .updateTable(job.table)
          .set({ updatedAt: Date.now() })
          .where("id", "=", job.row.id)
          .where("state", "=", "submitted")
          .execute();
      }
    }
    if (minted) await refreshMintedOwners(db, chain);
  } finally {
    await db.destroy();
  }
}
