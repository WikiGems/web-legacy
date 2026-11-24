import type { GameDb, PayoutSetupTable } from "./db";
import type { Env } from "./env";
import { HttpError } from "./http-error";
import { linkedWallet, marketConfig } from "./chain/config";
import { tryBroadcast } from "./chain/operations";
import {
  chainOutcome,
  connectChain,
  latestBlockhash,
  payoutAta,
  requireSponsorBalance,
  storedWire,
  verifyMarketAccounts,
  verifyUsdcMint,
} from "./chain/rpc";
import { signPreparedMessage, toBase64 } from "./chain/signing";
import { buildPayoutSetupTransaction } from "./chain/transactions";

function payoutAccountClosed() {
  return new HttpError(
    409,
    "This account already used its payout setup. Reopen and keep your USDC payout account.",
    "PAYOUT_ACCOUNT_CLOSED",
  );
}

export async function setupPayouts(db: GameDb, env: Env, userId: string) {
  const profile = await db
    .selectFrom("profiles")
    .select("walletAddress")
    .where("userId", "=", userId)
    .executeTakeFirst();
  const owner = linkedWallet(profile?.walletAddress);
  const [chain, config] = await Promise.all([
    connectChain(env),
    marketConfig(env),
  ]);
  await Promise.all([
    verifyMarketAccounts(chain, config),
    verifyUsdcMint(chain, config.usdcMint),
  ]);
  const { ata, exists } = await payoutAta(chain, owner, config.usdcMint);
  const base = {
    userId,
    walletAddress: owner,
    ataAddress: ata,
    genesisHash: chain.genesisHash,
  };

  const readSetup = (connection: GameDb) =>
    connection
      .selectFrom("payout_setups")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirst();

  const checkWallet = async (connection: GameDb) => {
    const current = await connection
      .selectFrom("profiles")
      .select("walletAddress")
      .where("userId", "=", userId)
      .executeTakeFirst();
    if (current?.walletAddress !== owner)
      throw new HttpError(
        409,
        "The linked wallet changed. Try again.",
        "WALLET_CHANGED",
      );
  };

  if (exists) {
    const txSignature = await db.transaction().execute(async (trx) => {
      await checkWallet(trx);
      const prior = await readSetup(trx);
      if (prior) {
        if (prior.readyAt === null) {
          await trx
            .updateTable("payout_setups")
            .set({ readyAt: Date.now() })
            .where("userId", "=", userId)
            .execute();
        }
        return prior.ataAddress === ata &&
          prior.genesisHash === chain.genesisHash
          ? prior.txSignature
          : null;
      }
      await trx
        .insertInto("payout_setups")
        .values({
          ...base,
          message: null,
          readyAt: Date.now(),
          txSignature: null,
          signedTransaction: null,
          lastValidBlockHeight: null,
        })
        .execute();
      return null;
    });
    return {
      state: "ready" as const,
      walletAddress: owner,
      ataAddress: ata,
      txSignature,
      failureCode: null,
    };
  }

  let row: PayoutSetupTable | undefined = await readSetup(db);
  let newlySigned = false;
  if (!row) {
    const [lifetime] = await Promise.all([
      latestBlockhash(chain),
      requireSponsorBalance(chain, env, config.sponsor.address),
    ]);
    row = await db.transaction().execute(async (trx) => {
      await checkWallet(trx);
      const prior = await readSetup(trx);
      if (prior) return prior;

      const transaction = buildPayoutSetupTransaction({
        id: crypto.randomUUID(),
        lifetime,
        sponsor: config.sponsor.address,
        owner,
        ata,
        mint: config.usdcMint,
      });
      const now = Date.now();
      const prepared = {
        message: toBase64(transaction.messageBytes),
        signerAddress: null,
        sponsorAddress: config.sponsor.address,
        lastValidBlockHeight: lifetime.lastValidBlockHeight.toString(),
        expiresAt: now + 120_000,
      };
      const signed = await signPreparedMessage(
        prepared,
        [config.sponsor],
        undefined,
        {
          now,
          blockHeight: lifetime.lastValidBlockHeight,
          blockhashValid: true,
        },
      );
      newlySigned = true;
      return trx
        .insertInto("payout_setups")
        .values({
          ...base,
          ...signed,
          message: prepared.message,
          readyAt: null,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  const { txSignature, signedTransaction, lastValidBlockHeight, message } = row;
  if (
    row.readyAt !== null ||
    row.ataAddress !== ata ||
    !txSignature ||
    !signedTransaction ||
    !lastValidBlockHeight ||
    !message
  )
    throw payoutAccountClosed();

  const outcome = newlySigned
    ? "unseen"
    : await chainOutcome(chain, {
        ...row,
        lastValidBlockHeight,
        message,
      });
  if (outcome === "settled") {
    const current = await payoutAta(chain, owner, config.usdcMint);
    await db
      .updateTable("payout_setups")
      .set({ readyAt: Date.now() })
      .where("userId", "=", userId)
      .where("readyAt", "is", null)
      .execute();
    if (!current.exists) throw payoutAccountClosed();
    return {
      state: "ready" as const,
      walletAddress: owner,
      ataAddress: ata,
      txSignature,
      failureCode: null,
    };
  }
  if (
    outcome === "failed" ||
    outcome === "not_found" ||
    outcome === "unseen_past_lifetime"
  ) {
    return {
      state: "failed" as const,
      walletAddress: owner,
      ataAddress: ata,
      txSignature,
      failureCode:
        outcome === "failed" ? "TRANSACTION_FAILED" : "TRANSACTION_EXPIRED",
    };
  }
  if (outcome === "unseen")
    await tryBroadcast(chain, storedWire({ signedTransaction }));

  return {
    state: "submitted" as const,
    walletAddress: owner,
    ataAddress: ata,
    txSignature,
    failureCode: null,
  };
}
