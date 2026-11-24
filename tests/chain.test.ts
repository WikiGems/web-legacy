import {
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getProgramDerivedAddress,
  getU64Encoder,
  signBytes,
} from "@solana/kit";
import {
  LEGACY_MEMO_PROGRAM_ADDRESS_V3,
  parseAddMemoInstruction,
} from "@solana-program/memo";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  parseCreateAssociatedTokenIdempotentInstruction,
  parseTransferCheckedInstruction,
} from "@solana-program/token";
import { makeSignature } from "better-auth/crypto";
import type { expect as vitestExpect, test as vitestTest } from "vitest";
import type { Claim, Purchase } from "../shared/domain";
import { handleApi } from "../worker/api";
import { createAuth } from "../worker/auth";
import { handleGemMetadata } from "../worker/card-metadata";
import { reconcileChain } from "../worker/chain/cron";
import { parseUsdcMinor, splitPrice } from "../worker/chain/amounts";
import {
  WIKIGEMS_PROGRAM_PROGRAM_ADDRESS as programAddress,
  parseMintGemInstruction,
} from "../worker/chain/generated";
import {
  fromBase64,
  requiredSigners,
  signPreparedMessage,
  toBase64,
} from "../worker/chain/signing";
import {
  CORE_PROGRAM_ADDRESS,
  buildClaimTransaction,
  buildPurchaseTransaction,
  usdcAta,
} from "../worker/chain/transactions";
import { prepareClaim, claimStatus } from "../worker/claims";
import { preparePurchase, purchaseStatus, setListing } from "../worker/market";
import { proposeTrade, decideTrade } from "../worker/trades";
import {
  chainFixture,
  lifetime,
  migratedDatabase,
  testKey,
} from "./chain-fixture";

// Run the same cases under the repository's Vitest script and the Bun runner.
const { expect, test } = (
  process.env.VITEST ? await import("vitest") : await import("bun:test")
) as { expect: typeof vitestExpect; test: typeof vitestTest };

function instructions(message: string) {
  const compiled = getCompiledTransactionMessageDecoder().decode(
    fromBase64(message),
  );
  if (compiled.version !== "legacy")
    throw new Error("Expected a legacy transaction message.");
  return decompileTransactionMessage(compiled).instructions.flatMap((ix) =>
    ix.data ? [{ ...ix, accounts: ix.accounts ?? [], data: ix.data }] : [],
  );
}

async function sign(
  dto: Claim | Purchase,
  key: Awaited<ReturnType<typeof testKey>>,
) {
  if (!dto.transaction) throw new Error("No transaction to sign.");
  return toBase64(
    await signBytes(
      key.keyPair.privateKey,
      fromBase64(dto.transaction.message),
    ),
  );
}

async function quote(
  fixture: Awaited<ReturnType<typeof chainFixture>>,
  cardId: string,
) {
  const listed = await setListing(fixture.db, {
    actorUserId: "seller",
    cardId,
    priceUsdcMinor: "1000001",
  });
  if (!listed.listing) throw new Error("No active listing.");
  return {
    listingId: listed.listing.id,
    expectedPriceUsdcMinor: listed.listing.priceUsdcMinor,
  };
}

test("migration preserves older cards and trades and allocates increasing IDs", async () => {
  const fixture = await migratedDatabase();
  const { client, db, addUser, addCard } = fixture;
  try {
    await addUser("alice");
    await addUser("bob");
    await addCard("second", "bob", 2);
    await addCard("first", "alice", 1);
    await db
      .insertInto("trades")
      .values({
        id: "old-trade",
        proposerId: "alice",
        counterpartyId: "bob",
        offeredCardId: "first",
        requestedCardId: "second",
        status: "proposed",
        createdAt: 3,
        updatedAt: 3,
      })
      .execute();
    await client.execute(
      "update cards set status = 'minted', mintAddress = 'old-asset', ownerWallet = 'old-wallet' where id = 'first'",
    );
    await fixture.migrate("005_lazy_claims");
    expect(
      await db
        .selectFrom("cards")
        .select(["id", "gemId", "mintAddress"])
        .orderBy("gemId")
        .execute(),
    ).toEqual([
      { id: "first", gemId: 1, mintAddress: "old-asset" },
      { id: "second", gemId: 2, mintAddress: null },
    ]);
    expect(await db.selectFrom("trades").select("id").execute()).toEqual([
      { id: "old-trade" },
    ]);
    expect((await client.execute("pragma foreign_key_check")).rows).toEqual([]);
    await addCard("removed", "alice");
    await db.deleteFrom("cards").where("id", "=", "removed").execute();
    await addCard("later", "alice");
    expect(
      await db
        .selectFrom("cards")
        .select("gemId")
        .where("id", "=", "later")
        .executeTakeFirst(),
    ).toEqual({ gemId: 4 });
  } finally {
    await fixture.close();
  }
});

test("USDC prices are canonical u64 strings and fees round down without overflow", () => {
  expect(parseUsdcMinor("1")).toBe(1n);
  expect(parseUsdcMinor("18446744073709551615")).toBe((1n << 64n) - 1n);
  for (const value of [
    "0",
    "-1",
    "01",
    " 1",
    "1.0",
    "1e6",
    "18446744073709551616",
  ]) {
    expect(parseUsdcMinor(value)).toBeNull();
  }
  expect(splitPrice(39n, 250)).toEqual({ fee: 0n, seller: 39n });
  expect(splitPrice(1000001n, 250)).toEqual({ fee: 25000n, seller: 975001n });
  expect(splitPrice((1n << 64n) - 1n, 250)).toEqual({
    fee: 461168601842738790n,
    seller: 17985575471866812825n,
  });
});

test("purchase message has canonical ATAs, checked USDC amounts and a memo", async () => {
  const [sponsor, buyer, seller, treasury, mint] = await Promise.all([
    testKey(),
    testKey(),
    testKey(),
    testKey(),
    testKey(),
  ]);
  const tx = await buildPurchaseTransaction({
    id: "purchase-id",
    lifetime,
    sponsor: sponsor.address,
    buyer: buyer.address,
    seller: seller.address,
    treasury: treasury.address,
    mint: mint.address,
    sellerAmount: 975001n,
    fee: 25000n,
  });
  const message = toBase64(tx.messageBytes);
  const ixs = instructions(message);
  expect(requiredSigners(message)).toEqual([sponsor.address, buyer.address]);
  expect(ixs.map((ix) => ix.programAddress)).toEqual([
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    LEGACY_MEMO_PROGRAM_ADDRESS_V3,
  ]);
  for (const [index, recipient, amount] of [
    [0, seller, 975001n],
    [2, treasury, 25000n],
  ] as const) {
    const create = parseCreateAssociatedTokenIdempotentInstruction(ixs[index]!);
    const transfer = parseTransferCheckedInstruction(ixs[index + 1]!);
    const ata = await usdcAta(recipient.address, mint.address);
    expect(create.data.discriminator).toBe(1);
    expect(create.accounts.payer.address).toBe(sponsor.address);
    expect(create.accounts.owner.address).toBe(recipient.address);
    expect(create.accounts.ata.address).toBe(ata);
    expect(transfer.accounts.source.address).toBe(
      await usdcAta(buyer.address, mint.address),
    );
    expect(transfer.accounts.mint.address).toBe(mint.address);
    expect(transfer.accounts.destination.address).toBe(ata);
    expect(transfer.accounts.authority.address).toBe(buyer.address);
    expect(transfer.data).toMatchObject({ amount, decimals: 6 });
  }
  expect(parseAddMemoInstruction(ixs[4]!).data.memo).toBe("purchase-id");

  const tiny = await buildPurchaseTransaction({
    id: "tiny",
    lifetime,
    sponsor: sponsor.address,
    buyer: buyer.address,
    seller: seller.address,
    treasury: treasury.address,
    mint: mint.address,
    sellerAmount: 1n,
    fee: 0n,
  });
  expect(instructions(toBase64(tiny.messageBytes))).toHaveLength(3);
});

test("free and paid claim messages pin the gem PDA, destination and UTF-8 limits", async () => {
  const [sponsor, authority, buyer, recipient, treasury, mint] =
    await Promise.all([
      testKey(),
      testKey(),
      testKey(),
      testKey(),
      testKey(),
      testKey(),
    ]);
  const input = {
    id: "claim-id",
    lifetime,
    sponsor: sponsor.address,
    mintAuthority: authority.address,
    programAddress,
    collection: mint.address,
    destination: recipient.address,
    gemId: 1234,
    title: "💎".repeat(20),
    origin: "https://wikigems.example",
  };
  const free = await buildClaimTransaction({ ...input, payment: null });
  const message = toBase64(free.transaction.messageBytes);
  const [expected] = await getProgramDerivedAddress({
    programAddress,
    seeds: [new TextEncoder().encode("gem"), getU64Encoder().encode(1234n)],
  });
  const freeIxs = instructions(message);
  const gem = parseMintGemInstruction(freeIxs[0]!);
  expect(freeIxs).toHaveLength(2);
  expect(free.assetAddress).toBe(expected);
  expect(gem.data).toMatchObject({
    gemId: 1234n,
    name: "WikiGems: 💎💎💎💎💎",
    uri: "https://wikigems.example/g/1234",
  });
  expect(gem.accounts.asset.address).toBe(expected);
  expect(gem.accounts.payer.address).toBe(sponsor.address);
  expect(gem.accounts.mintAuthority.address).toBe(authority.address);
  expect(gem.accounts.owner.address).toBe(recipient.address);
  expect(gem.accounts.collection.address).toBe(mint.address);
  expect(gem.accounts.mplCoreProgram.address).toBe(CORE_PROGRAM_ADDRESS);
  expect(requiredSigners(message)).toEqual([
    sponsor.address,
    authority.address,
  ]);
  const paid = await buildClaimTransaction({
    ...input,
    payment: {
      buyer: buyer.address,
      treasury: treasury.address,
      mint: mint.address,
      amount: 250000n,
    },
  });
  const paidMessage = toBase64(paid.transaction.messageBytes);
  const paidIxs = instructions(paidMessage);
  expect(requiredSigners(paidMessage)).toHaveLength(3);
  expect(requiredSigners(paidMessage)).toContain(buyer.address);
  expect(parseTransferCheckedInstruction(paidIxs[1]!).data.amount).toBe(
    250000n,
  );
  expect(parseMintGemInstruction(paidIxs[2]!).accounts.owner.address).toBe(
    recipient.address,
  );
  await expect(
    buildClaimTransaction({
      ...input,
      origin: `https://${"long".repeat(30)}.example`,
      payment: null,
    }),
  ).rejects.toMatchObject({ code: "CHAIN_NOT_CONFIGURED" });
});

test("signing verifies the exact message, signer and blockhash lifetime", async () => {
  const [sponsor, buyer, seller, treasury, mint] = await Promise.all([
    testKey(),
    testKey(),
    testKey(),
    testKey(),
    testKey(),
  ]);
  const input = {
    id: "first",
    lifetime,
    sponsor: sponsor.address,
    buyer: buyer.address,
    seller: seller.address,
    treasury: treasury.address,
    mint: mint.address,
    sellerAmount: 9n,
    fee: 1n,
  };
  const tx = await buildPurchaseTransaction(input);
  const tampered = await buildPurchaseTransaction({ ...input, id: "other" });
  const row = {
    message: toBase64(tx.messageBytes),
    sponsorAddress: sponsor.address,
    signerAddress: buyer.address,
    expiresAt: 2000,
    lastValidBlockHeight: "150",
  };
  const fresh = { now: 1000, blockHeight: 150n, blockhashValid: true };
  const valid = toBase64(
    await signBytes(buyer.keyPair.privateKey, tx.messageBytes),
  );
  const wrong = toBase64(
    await signBytes(seller.keyPair.privateKey, tx.messageBytes),
  );

  const signed = await signPreparedMessage(row, [sponsor], valid, fresh);
  const decoded = getTransactionDecoder().decode(
    fromBase64(signed.signedTransaction),
  );
  expect(decoded.messageBytes).toEqual(tx.messageBytes);
  expect(getSignatureFromTransaction(decoded)).toBe(signed.txSignature);
  expect(toBase64(decoded.signatures[buyer.address]!)).toBe(valid);
  await expect(
    signPreparedMessage(row, [sponsor], wrong, fresh),
  ).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
  await expect(
    signPreparedMessage(
      { ...row, message: toBase64(tampered.messageBytes) },
      [sponsor],
      valid,
      fresh,
    ),
  ).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
  for (const expired of [
    { ...fresh, blockHeight: 151n },
    { ...fresh, now: 2000 },
    { ...fresh, blockhashValid: false },
  ]) {
    await expect(
      signPreparedMessage(row, [sponsor], valid, expired),
    ).rejects.toMatchObject({ code: "TRANSACTION_EXPIRED" });
  }
});

test("purchase owns the lock, persists before sending and reconciles the exact finalized wire once", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("sold", "seller");
    await fixture.addCard("offered", "buyer");
    const listing = await quote(fixture, "sold");
    await expect(
      preparePurchase(db, env, { ...listing, actorUserId: "seller" }),
    ).rejects.toMatchObject({ code: "SELF_PURCHASE" });
    await expect(
      preparePurchase(db, env, {
        ...listing,
        actorUserId: "buyer",
        expectedPriceUsdcMinor: "1000000",
      }),
    ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    const [first, second] = await Promise.allSettled([
      preparePurchase(db, env, { ...listing, actorUserId: "buyer" }),
      preparePurchase(db, env, { ...listing, actorUserId: "other" }),
    ]);
    const succeeded = [first, second].filter(
      (result) => result.status === "fulfilled",
    );
    expect(succeeded).toHaveLength(1);
    const purchase = succeeded[0]!.value;
    const winner = first.status === "fulfilled" ? "buyer" : "other";
    const loser = winner === "buyer" ? "other" : "buyer";
    const wallet = winner === "buyer" ? fixture.buyer : fixture.other;
    expect(purchase.state).toBe("prepared");
    expect(
      (await preparePurchase(db, env, { ...listing, actorUserId: winner })).id,
    ).toBe(purchase.id);
    await expect(
      purchaseStatus(db, env, { actorUserId: loser, id: purchase.id }),
    ).rejects.toMatchObject({ code: "OPERATION_NOT_FOUND" });
    await expect(
      setListing(db, {
        actorUserId: "seller",
        cardId: "sold",
        priceUsdcMinor: null,
      }),
    ).rejects.toMatchObject({ code: "CARD_LOCKED" });
    await expect(
      proposeTrade(db, {
        actorUserId: "buyer",
        offeredCardId: "offered",
        requestedCardId: "sold",
      }),
    ).rejects.toMatchObject({ code: "CARD_LOCKED" });

    let persisted = false;
    fixture.failBroadcast(async () => {
      const row = await db
        .selectFrom("purchases")
        .selectAll()
        .where("id", "=", purchase.id)
        .executeTakeFirstOrThrow();
      persisted =
        row.state === "submitted" &&
        Boolean(row.txSignature && row.signedTransaction);
    });
    const submitted = await purchaseStatus(db, env, {
      actorUserId: winner,
      id: purchase.id,
      signature: await sign(purchase, wallet),
    });
    expect(persisted).toBe(true);
    expect(submitted.state).toBe("submitted");
    expect(
      (
        await db
          .selectFrom("cards")
          .select("ownerUserId")
          .where("id", "=", "sold")
          .executeTakeFirst()
      )?.ownerUserId,
    ).toBe("seller");

    fixture.finalize(submitted.txSignature!, {
      wire: toBase64(new Uint8Array([0])),
    });
    await expect(
      purchaseStatus(db, env, { actorUserId: winner, id: purchase.id }),
    ).rejects.toMatchObject({ code: "CHAIN_UNAVAILABLE" });
    fixture.finalize(submitted.txSignature!);
    await reconcileChain(env);
    await reconcileChain(env);
    expect(
      (await purchaseStatus(db, env, { actorUserId: winner, id: purchase.id }))
        .state,
    ).toBe("settled");
    expect(
      (
        await db
          .selectFrom("cards")
          .select("ownerUserId")
          .where("id", "=", "sold")
          .executeTakeFirst()
      )?.ownerUserId,
    ).toBe(winner);
    expect(
      (
        await db
          .selectFrom("listings")
          .select("closedAt")
          .where("id", "=", listing.listingId)
          .executeTakeFirst()
      )?.closedAt,
    ).toBeGreaterThan(0);
    expect(fixture.signedWires.size).toBe(1);
  } finally {
    await fixture.close();
  }
});

test("off-chain trades still settle and close any USDC listing on cards that change hands", async () => {
  const fixture = await chainFixture();
  const { db } = fixture;
  try {
    await fixture.addCard("listed", "seller");
    await fixture.addCard("offered", "buyer");
    await fixture.addCard("competing", "other");
    const listing = await quote(fixture, "listed");
    const offered = await proposeTrade(db, {
      actorUserId: "buyer",
      offeredCardId: "offered",
      requestedCardId: "listed",
    });
    await proposeTrade(db, {
      actorUserId: "other",
      offeredCardId: "competing",
      requestedCardId: "listed",
    });
    expect(
      await decideTrade(db, {
        actorUserId: "seller",
        tradeId: offered.id,
        action: "accept",
      }),
    ).toEqual({ ok: true, status: "settled" });
    expect(
      await db
        .selectFrom("cards")
        .select(["id", "ownerUserId"])
        .where("id", "in", ["listed", "offered"])
        .orderBy("id")
        .execute(),
    ).toEqual([
      { id: "listed", ownerUserId: "buyer" },
      { id: "offered", ownerUserId: "seller" },
    ]);
    expect(
      (
        await db
          .selectFrom("listings")
          .select("closedAt")
          .where("id", "=", listing.listingId)
          .executeTakeFirst()
      )?.closedAt,
    ).toBeGreaterThan(0);
    expect(
      (
        await setListing(db, {
          actorUserId: "buyer",
          cardId: "listed",
          priceUsdcMinor: "5",
        })
      ).listing?.priceUsdcMinor,
    ).toBe("5");
  } finally {
    await fixture.close();
  }
});

test("failed or expired payments release the card only after the chain outcome is known", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("locked", "seller");
    const listing = await quote(fixture, "locked");
    const order = { ...listing, actorUserId: "buyer" };
    await db
      .updateTable("profiles")
      .set({ walletAddress: null })
      .where("userId", "=", "buyer")
      .execute();
    await expect(preparePurchase(db, env, order)).rejects.toMatchObject({
      code: "WALLET_REQUIRED",
    });
    await db
      .updateTable("profiles")
      .set({ walletAddress: fixture.buyer.address })
      .where("userId", "=", "buyer")
      .execute();
    await db
      .updateTable("profiles")
      .set({ walletAddress: null })
      .where("userId", "=", "seller")
      .execute();
    await expect(preparePurchase(db, env, order)).rejects.toMatchObject({
      code: "SELLER_WALLET_REQUIRED",
    });
    await db
      .updateTable("profiles")
      .set({ walletAddress: fixture.seller.address })
      .where("userId", "=", "seller")
      .execute();
    const first = await preparePurchase(db, env, order);
    const action = { actorUserId: "buyer", id: first.id };
    const sent = await purchaseStatus(db, env, {
      ...action,
      signature: await sign(first, fixture.buyer),
    });

    fixture.setHeight(151);
    fixture.observed.add(sent.txSignature!);
    await reconcileChain(env);
    expect((await purchaseStatus(db, env, action)).state).toBe("submitted");
    fixture.observed.delete(sent.txSignature!);
    await reconcileChain(env);
    expect((await purchaseStatus(db, env, action)).state).toBe("expired");
    fixture.setHeight(100);

    const second = await preparePurchase(db, env, order);
    const retry = { actorUserId: "buyer", id: second.id };
    const sentAgain = await purchaseStatus(db, env, {
      ...retry,
      signature: await sign(second, fixture.buyer),
    });
    fixture.finalize(sentAgain.txSignature!, {
      err: { InstructionError: [1, "InsufficientFunds"] },
    });
    await reconcileChain(env);
    expect((await purchaseStatus(db, env, retry)).state).toBe("failed");
    expect(
      await db
        .selectFrom("cards")
        .select("ownerUserId")
        .where("id", "=", "locked")
        .executeTakeFirst(),
    ).toEqual({ ownerUserId: "seller" });
    expect((await preparePurchase(db, env, order)).state).toBe("prepared");
  } finally {
    await fixture.close();
  }
});

test("verified free claims reserve a slot, block trades, and sync owner transfers from Core", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("free", "seller");
    await fixture.addCard("paid", "seller");
    await fixture.addCard("retry", "seller");
    await fixture.addCard("offered", "buyer");
    await fixture.addCard("unverified", "other");
    const listing = await quote(fixture, "free");
    const trade = await proposeTrade(db, {
      actorUserId: "buyer",
      offeredCardId: "offered",
      requestedCardId: "free",
    });
    await expect(
      setListing(db, {
        actorUserId: "seller",
        cardId: "free",
        priceUsdcMinor: "8",
      }),
    ).rejects.toMatchObject({ code: "TRADE_PENDING" });
    await expect(
      preparePurchase(db, env, { ...listing, actorUserId: "buyer" }),
    ).rejects.toMatchObject({ code: "TRADE_PENDING" });

    const free = await prepareClaim(db, env, {
      cardId: "free",
      actorUserId: "seller",
      destination: fixture.buyer.address,
    });
    expect(free).toMatchObject({
      state: "submitted",
      usesFreeClaim: true,
      transaction: null,
      priceUsdcMinor: "0",
    });
    await expect(
      decideTrade(db, {
        actorUserId: "seller",
        tradeId: trade.id,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "CARD_LOCKED" });

    const paid = await prepareClaim(db, env, {
      cardId: "paid",
      actorUserId: "seller",
      destination: fixture.buyer.address,
    });
    expect(paid).toMatchObject({
      state: "prepared",
      usesFreeClaim: false,
      priceUsdcMinor: "250000",
    });
    expect(paid.transaction?.signerAddress).toBe(fixture.seller.address);
    expect(
      (
        await prepareClaim(db, env, {
          cardId: "unverified",
          actorUserId: "other",
        })
      ).usesFreeClaim,
    ).toBe(false);

    fixture.owners.set(free.assetAddress, fixture.buyer.address);
    fixture.finalize(free.txSignature!);
    await reconcileChain(env);
    expect(
      (await claimStatus(db, env, { actorUserId: "seller", id: free.id }))
        .state,
    ).toBe("settled");
    expect(
      (await prepareClaim(db, env, { actorUserId: "seller", cardId: "free" }))
        .id,
    ).toBe(free.id);
    expect(
      await db
        .selectFrom("cards")
        .select(["status", "ownerUserId", "ownerWallet", "mintAddress"])
        .where("id", "=", "free")
        .executeTakeFirst(),
    ).toEqual({
      status: "minted",
      ownerUserId: "buyer",
      ownerWallet: fixture.buyer.address,
      mintAddress: free.assetAddress,
    });
    expect(
      (
        await db
          .selectFrom("trades")
          .select("status")
          .where("id", "=", trade.id)
          .executeTakeFirst()
      )?.status,
    ).toBe("cancelled");
    expect(
      (
        await db
          .selectFrom("listings")
          .select("closedAt")
          .where("id", "=", listing.listingId)
          .executeTakeFirst()
      )?.closedAt,
    ).toBeGreaterThan(0);

    fixture.owners.set(free.assetAddress, fixture.mint.address);
    await reconcileChain(env);
    expect(fixture.reads.at(-1)).toEqual([free.assetAddress]);
    expect(
      await db
        .selectFrom("cards")
        .select(["ownerUserId", "ownerWallet"])
        .where("id", "=", "free")
        .executeTakeFirst(),
    ).toEqual({
      ownerUserId: null,
      ownerWallet: fixture.mint.address,
    });

    const sent = await claimStatus(db, env, {
      actorUserId: "seller",
      id: paid.id,
      signature: await sign(paid, fixture.seller),
    });
    fixture.owners.set(paid.assetAddress, fixture.buyer.address);
    fixture.finalize(sent.txSignature!);
    await reconcileChain(env);
    expect(
      (await claimStatus(db, env, { actorUserId: "seller", id: paid.id }))
        .state,
    ).toBe("settled");
    expect(
      (await prepareClaim(db, env, { cardId: "retry", actorUserId: "seller" }))
        .usesFreeClaim,
    ).toBe(false);
  } finally {
    await fixture.close();
  }
});

test("expired free claims restore the allowance and a stale prepared blockhash cannot submit", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("first", "buyer");
    await fixture.addCard("retry", "buyer");
    const first = await prepareClaim(db, env, {
      cardId: "first",
      actorUserId: "buyer",
    });
    expect(first.usesFreeClaim).toBe(true);
    fixture.setHeight(151);
    await reconcileChain(env);
    expect(
      (await claimStatus(db, env, { actorUserId: "buyer", id: first.id }))
        .state,
    ).toBe("expired");
    fixture.setHeight(100);
    const retry = await prepareClaim(db, env, {
      cardId: "retry",
      actorUserId: "buyer",
    });
    expect(retry.usesFreeClaim).toBe(true);

    await fixture.addCard("expired", "seller");
    const listing = await quote(fixture, "expired");
    const purchase = await preparePurchase(db, env, {
      ...listing,
      actorUserId: "buyer",
    });
    fixture.invalidateBlockhash();
    await expect(
      purchaseStatus(db, env, {
        actorUserId: "buyer",
        id: purchase.id,
        signature: await sign(purchase, fixture.buyer),
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_EXPIRED" });
    fixture.setHeight(151);
    expect(
      (await purchaseStatus(db, env, { actorUserId: "buyer", id: purchase.id }))
        .state,
    ).toBe("expired");
    expect(fixture.signedWires.size).toBe(2);
  } finally {
    await fixture.close();
  }
});

test("HTTP exposes signed-in listings, typed chain errors and public gem metadata", async () => {
  const fixture = await chainFixture();
  const env = { ...fixture.env, SPONSOR_SECRET_KEY: undefined };
  const baseURL = env.PUBLIC_ORIGIN!;
  const auth = createAuth({ ...env, BETTER_AUTH_URL: baseURL });
  const context = await auth.$context;
  try {
    await fixture.addCard("api", "seller");
    const session = await context.internalAdapter.createSession("seller");
    const token = encodeURIComponent(
      `${session.token}.${await makeSignature(session.token, env.BETTER_AUTH_SECRET)}`,
    );
    const cookie = `${context.authCookies.sessionToken.name}=${token}`;
    const request = (
      path: string,
      body?: unknown,
      origin = baseURL,
      authenticated = true,
    ) =>
      handleApi(
        new Request(
          baseURL + path,
          body === undefined
            ? undefined
            : {
                method: "POST",
                headers: {
                  origin,
                  cookie: authenticated ? cookie : "",
                  "content-type": "application/json",
                },
                body: JSON.stringify(body),
              },
        ),
        env,
        auth,
      );

    expect(
      (
        await request(
          "/api/cards/api/listing",
          { priceUsdcMinor: "900" },
          baseURL,
          false,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/api/cards/api/listing",
          { priceUsdcMinor: "900" },
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    const listing = await request("/api/cards/api/listing", {
      priceUsdcMinor: "900",
    });
    expect(listing.status).toBe(200);
    expect(await listing.json()).toMatchObject({
      listing: { priceUsdcMinor: "900", card: { gemId: 1, id: "api" } },
    });
    const market = await request("/api/market");
    expect(await market.json()).toMatchObject({
      listings: [{ priceUsdcMinor: "900" }],
      cards: [{ id: "api" }],
    });
    const missingChain = await request("/api/cards/api/claim", {});
    expect(missingChain.status).toBe(503);
    expect(await missingChain.json()).toMatchObject({
      code: "CHAIN_NOT_CONFIGURED",
    });
    expect((await request("/api/cards/api/mint-confirm", {})).status).toBe(404);
    const url = new URL("/g/1", baseURL);
    const metadata = await handleGemMetadata(new Request(url), url, env);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      image: `${baseURL}/api/cards/api/art.svg`,
      name: "WikiGems: Card api 💎",
    });
  } finally {
    await fixture.close();
    const database = context.options.database;
    if (
      database &&
      "db" in database &&
      database.db instanceof Object &&
      "destroy" in database.db &&
      typeof database.db.destroy === "function"
    ) {
      await database.db.destroy();
    }
  }
});
