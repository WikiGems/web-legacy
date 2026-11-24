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
import {
  formatDollars,
  parseDollars,
  parseUsdcMinor,
  splitPrice,
} from "../shared/amounts";
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
  buildPayoutSetupTransaction,
  usdcAta,
} from "../worker/chain/transactions";
import { prepareClaim, claimStatus } from "../worker/claims";
import { preparePurchase, purchaseStatus, setListing } from "../worker/market";
import { setupPayouts } from "../worker/payouts";
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
  const listed = await setListing(fixture.db, fixture.env, {
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

test("security migration retires legacy unsigned purchases and preserves submitted and expired signed wire", async () => {
  const fixture = await migratedDatabase();
  const { client, db } = fixture;
  try {
    await fixture.migrate("005_lazy_claims");
    await fixture.addUser("seller");
    for (const cardId of ["unsigned", "in-flight", "old-expiry"]) {
      await fixture.addCard(cardId, "seller");
      await db
        .insertInto("listings")
        .values({
          id: cardId,
          cardId,
          sellerUserId: "seller",
          priceUsdcMinor: "100000",
          createdAt: 1,
          updatedAt: 1,
          closedAt: null,
        })
        .execute();
    }
    for (const [id, state, txSignature] of [
      ["unsigned", "prepared", null],
      ["in-flight", "submitted", "signed-now"],
      ["old-expiry", "expired", "signed-before"],
    ] as const) {
      await client.execute({
        sql: `insert into purchases (id, cardId, listingId, actorUserId, sellerUserId, priceUsdcMinor, feeUsdcMinor,
          state, message, lastValidBlockHeight, genesisHash, sponsorAddress, signerAddress, txSignature, signedTransaction,
          createdAt, updatedAt, expiresAt) values (?, ?, ?, 'buyer', 'seller', '100000', '1', ?, 'msg', '150',
          'genesis', 'sponsor', 'buyer', ?, ?, 1, 2, 3)`,
        args: [id, id, id, state, txSignature, txSignature ? "wire" : null],
      });
    }
    await fixture.migrate("007_sponsor_safety");
    expect(
      await db
        .selectFrom("purchases")
        .select([
          "id",
          "state",
          "txSignature",
          "signedTransaction",
          "expiredAt",
        ])
        .orderBy("id")
        .execute(),
    ).toEqual([
      {
        id: "in-flight",
        state: "submitted",
        txSignature: "signed-now",
        signedTransaction: "wire",
        expiredAt: null,
      },
      {
        id: "old-expiry",
        state: "expired",
        txSignature: "signed-before",
        signedTransaction: "wire",
        expiredAt: 2,
      },
      {
        id: "unsigned",
        state: "expired",
        txSignature: null,
        signedTransaction: null,
        expiredAt: null,
      },
    ]);
  } finally {
    await fixture.close();
  }
});

test("USDC prices are canonical u64 strings and fees round down with a nonzero minimum", () => {
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
  expect(splitPrice(39n, 250)).toEqual({ fee: 1n, seller: 38n });
  expect(splitPrice(39n, 0)).toEqual({ fee: 0n, seller: 39n });
  expect(splitPrice(1000001n, 250)).toEqual({ fee: 25000n, seller: 975001n });
  expect(splitPrice((1n << 64n) - 1n, 250)).toEqual({
    fee: 461168601842738790n,
    seller: 17985575471866812825n,
  });
});

test("dollar input and display preserve six decimals across the u64 range", () => {
  expect(parseDollars(".000001")).toBe("1");
  expect(parseDollars(" 000000000000001.50 ")).toBe("1500000");
  expect(parseDollars("18446744073709.551615")).toBe("18446744073709551615");
  expect(formatDollars("18446744073709551615")).toBe(
    "$18,446,744,073,709.551615",
  );
  expect(formatDollars("1500000")).toBe("$1.50");
  for (const input of ["0", "-2", "1e3", "1.0000001", "18446744073709.551616"])
    expect(parseDollars(input)).toBeNull();
});

test("purchase has exactly checked USDC transfers and a memo while payout setup is sponsor-only", async () => {
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
    TOKEN_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    LEGACY_MEMO_PROGRAM_ADDRESS_V3,
  ]);
  for (const [index, recipient, amount] of [
    [0, seller, 975001n],
    [1, treasury, 25000n],
  ] as const) {
    const transfer = parseTransferCheckedInstruction(ixs[index]!);
    const ata = await usdcAta(recipient.address, mint.address);
    expect(transfer.accounts.source.address).toBe(
      await usdcAta(buyer.address, mint.address),
    );
    expect(transfer.accounts.mint.address).toBe(mint.address);
    expect(transfer.accounts.destination.address).toBe(ata);
    expect(transfer.accounts.authority.address).toBe(buyer.address);
    expect(transfer.data).toMatchObject({ amount, decimals: 6 });
  }
  expect(parseAddMemoInstruction(ixs[2]!).data.memo).toBe("purchase-id");

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
  expect(instructions(toBase64(tiny.messageBytes))).toHaveLength(2);
  const ata = await usdcAta(seller.address, mint.address);
  const setup = buildPayoutSetupTransaction({
    id: "payout-setup",
    sponsor: sponsor.address,
    lifetime,
    owner: seller.address,
    mint: mint.address,
    ata,
  });
  const setupMessage = toBase64(setup.messageBytes);
  expect(requiredSigners(setupMessage)).toEqual([sponsor.address]);
  const [create] = instructions(setupMessage);
  expect(create?.programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  const parsed = parseCreateAssociatedTokenIdempotentInstruction(create!);
  expect(parsed.data.discriminator).toBe(1);
  expect(parsed.accounts.owner.address).toBe(seller.address);
  expect(parsed.accounts.ata.address).toBe(ata);
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
  expect(parseTransferCheckedInstruction(paidIxs[0]!).data.amount).toBe(
    250000n,
  );
  expect(parseMintGemInstruction(paidIxs[1]!).accounts.owner.address).toBe(
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
    const [purchase, rival] = await Promise.all([
      preparePurchase(db, env, { ...listing, actorUserId: "buyer" }),
      preparePurchase(db, env, { ...listing, actorUserId: "other" }),
    ]);
    expect(purchase.state).toBe("prepared");
    expect(rival.state).toBe("prepared");
    expect(
      (await preparePurchase(db, env, { ...listing, actorUserId: "buyer" })).id,
    ).toBe(purchase.id);
    await expect(
      purchaseStatus(db, env, { actorUserId: "other", id: purchase.id }),
    ).rejects.toMatchObject({ code: "OPERATION_NOT_FOUND" });

    let persisted = false;
    fixture.failBroadcast(async () => {
      const row = await db
        .selectFrom("purchases")
        .selectAll()
        .where("cardId", "=", "sold")
        .where("state", "=", "submitted")
        .executeTakeFirstOrThrow();
      persisted =
        row.state === "submitted" &&
        Boolean(row.txSignature && row.signedTransaction);
    });
    const [buyerSignature, rivalSignature] = await Promise.all([
      sign(purchase, fixture.buyer),
      sign(rival, fixture.other),
    ]);
    const outcomes = await Promise.allSettled([
      purchaseStatus(db, env, {
        actorUserId: "buyer",
        id: purchase.id,
        signature: buyerSignature,
      }),
      purchaseStatus(db, env, {
        actorUserId: "other",
        id: rival.id,
        signature: rivalSignature,
      }),
    ]);
    const [successful] = outcomes.filter(
      (result) => result.status === "fulfilled",
    );
    const [rejected] = outcomes.filter(
      (result) => result.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      status: 409,
      code: "CARD_LOCKED",
    });
    const submitted = successful!.value;
    const winner = submitted.id === purchase.id ? "buyer" : "other";
    await expect(
      setListing(db, env, {
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

    // Historical proposals may already be stale; ownership settlement must close them too.
    await db
      .insertInto("trades")
      .values({
        id: "old-purchase-proposal",
        proposerId: "other",
        counterpartyId: "seller",
        offeredCardId: "offered",
        requestedCardId: "sold",
        status: "proposed",
        createdAt: 1,
        updatedAt: 1,
      })
      .execute();

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
      purchaseStatus(db, env, { actorUserId: winner, id: submitted.id }),
    ).rejects.toMatchObject({ code: "CHAIN_UNAVAILABLE" });
    fixture.finalize(submitted.txSignature!);
    await reconcileChain(env);
    await reconcileChain(env);
    expect(
      (await purchaseStatus(db, env, { actorUserId: winner, id: submitted.id }))
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
    expect(
      await db
        .selectFrom("trades")
        .select("status")
        .where("id", "=", "old-purchase-proposal")
        .executeTakeFirst(),
    ).toEqual({ status: "cancelled" });
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
    await fixture.addCard("competing-other-side", "other");
    const listing = await quote(fixture, "listed");
    const offered = await proposeTrade(db, {
      actorUserId: "buyer",
      offeredCardId: "offered",
      requestedCardId: "listed",
    });
    const competing = await proposeTrade(db, {
      actorUserId: "other",
      offeredCardId: "competing",
      requestedCardId: "listed",
    });
    const otherSide = await proposeTrade(db, {
      actorUserId: "other",
      offeredCardId: "competing-other-side",
      requestedCardId: "offered",
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
      await db
        .selectFrom("trades")
        .select("status")
        .where("id", "in", [competing.id, otherSide.id])
        .execute(),
    ).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
    await fixture.setPayoutAccount(fixture.buyer.address);
    expect(
      (
        await setListing(db, fixture.env, {
          actorUserId: "buyer",
          cardId: "listed",
          priceUsdcMinor: "100000",
        })
      ).listing?.priceUsdcMinor,
    ).toBe("100000");
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

    fixture.setHeight(182);
    await reconcileChain(env);
    expect((await purchaseStatus(db, env, action)).state).toBe("submitted");
    fixture.setHeight(183);
    fixture.observed.add(sent.txSignature!);
    await reconcileChain(env);
    expect((await purchaseStatus(db, env, action)).state).toBe("submitted");
    fixture.observed.delete(sent.txSignature!);
    const clock = Date.now;
    const start = clock();
    try {
      for (const minutes of [0, 1, 15, 29]) {
        Date.now = () => start + minutes * 60_000;
        await reconcileChain(env);
        expect((await purchaseStatus(db, env, action)).state).toBe("submitted");
      }
      Date.now = () => start + 30 * 60_000;
      await reconcileChain(env);
      expect((await purchaseStatus(db, env, action)).state).toBe("expired");
    } finally {
      Date.now = clock;
    }
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
      setListing(db, fixture.env, {
        actorUserId: "seller",
        cardId: "free",
        priceUsdcMinor: "100000",
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
    fixture.setHeight(183);
    const clock = Date.now;
    const start = clock();
    try {
      for (const minutes of [0, 15, 30]) {
        Date.now = () => start + minutes * 60_000;
        await reconcileChain(env);
      }
      expect(
        (await claimStatus(db, env, { actorUserId: "buyer", id: first.id }))
          .state,
      ).toBe("expired");
    } finally {
      Date.now = clock;
    }
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
  const env = fixture.env;
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
      account = "seller",
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
                  "x-wikigems-account": account,
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
          { priceUsdcMinor: "100000" },
          baseURL,
          false,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/api/cards/api/listing",
          { priceUsdcMinor: "100000" },
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    for (const path of [
      "/api/trades",
      "/api/trades/example/accept",
      "/api/trades/example/decline",
      "/api/trades/example/cancel",
      "/api/cards/api/trade",
      "/api/cards/api/listing",
      "/api/cards/api/claim",
      "/api/purchases",
      "/api/purchases/example/sign",
      "/api/claims/example/sign",
      "/api/purchases/example",
      "/api/claims/example",
      "/api/wallet/payouts",
    ]) {
      const mismatched = await request(path, {}, baseURL, true, "buyer");
      expect(mismatched.status, path).toBe(409);
      expect(await mismatched.json(), path).toMatchObject({
        code: "ACTIVE_ACCOUNT_CHANGED",
      });
      const foreign = await request(path, {}, "https://untrusted.example");
      expect(foreign.status, path).toBe(403);
      expect(await foreign.json(), path).toMatchObject({
        code: "UNTRUSTED_ORIGIN",
      });
    }
    const listing = await request("/api/cards/api/listing", {
      priceUsdcMinor: "100000",
    });
    expect(listing.status).toBe(200);
    expect(await listing.json()).toMatchObject({
      listing: { priceUsdcMinor: "100000", card: { gemId: 1, id: "api" } },
    });
    const market = await request("/api/market");
    expect(await market.json()).toMatchObject({
      listings: [{ priceUsdcMinor: "100000" }],
      cards: [{ id: "api" }],
    });
    const payout = await request("/api/wallet/payouts", {});
    expect(payout.status).toBe(200);
    expect(await payout.json()).toEqual({
      state: "ready",
      walletAddress: fixture.seller.address,
      ataAddress: await usdcAta(fixture.seller.address, fixture.mint.address),
      txSignature: null,
      failureCode: null,
    });
    const sponsorSecret = env.SPONSOR_SECRET_KEY;
    env.SPONSOR_SECRET_KEY = undefined;
    const missingChain = await request("/api/cards/api/claim", {});
    env.SPONSOR_SECRET_KEY = sponsorSecret;
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

test("minimum listing and purchase prices are enforced before signing and both recipient ATAs are required", async () => {
  const { db, env, ...fixture } = await chainFixture();
  try {
    await fixture.addCard("quote", "seller");
    const listing = await quote({ db, env, ...fixture }, "quote");
    await expect(
      setListing(db, env, {
        actorUserId: "seller",
        cardId: "quote",
        priceUsdcMinor: "1",
      }),
    ).rejects.toMatchObject({ status: 400, code: "PRICE_BELOW_MINIMUM" });
    await expect(
      preparePurchase(db, env, {
        actorUserId: "buyer",
        ...listing,
        expectedPriceUsdcMinor: "1",
      }),
    ).rejects.toMatchObject({ status: 400, code: "PRICE_BELOW_MINIMUM" });

    await fixture.setPayoutAccount(fixture.seller.address, false);
    const order = { actorUserId: "buyer", ...listing };
    await expect(preparePurchase(db, env, order)).rejects.toMatchObject({
      status: 409,
      code: "SELLER_PAYOUT_REQUIRED",
    });
    await fixture.setPayoutAccount(fixture.seller.address);
    const prepared = await preparePurchase(db, env, order);
    await fixture.setPayoutAccount(fixture.treasury.address, false);
    await expect(
      purchaseStatus(db, env, {
        actorUserId: "buyer",
        id: prepared.id,
        signature: await sign(prepared, fixture.buyer),
      }),
    ).rejects.toMatchObject({ status: 503, code: "TREASURY_PAYOUT_REQUIRED" });
    expect(fixture.signedWires.size).toBe(0);
  } finally {
    await fixture.close();
  }
});

test("listing starts sponsor-only payout setup once and records an already existing ATA as used", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("receivable", "buyer");
    const input = {
      actorUserId: "buyer",
      cardId: "receivable",
      priceUsdcMinor: "100000",
    };
    await expect(setListing(db, env, input)).rejects.toMatchObject({
      status: 409,
      code: "PAYOUT_SETUP_PENDING",
    });
    const pending = await setupPayouts(db, env, "buyer");
    expect(pending).toMatchObject({
      state: "submitted",
      walletAddress: fixture.buyer.address,
      failureCode: null,
    });
    expect(fixture.signedWires.size).toBe(1);
    const row = await db
      .selectFrom("payout_setups")
      .selectAll()
      .where("userId", "=", "buyer")
      .executeTakeFirstOrThrow();
    expect(requiredSigners(row.message!)).toEqual([fixture.sponsor.address]);
    fixture.finalize(pending.txSignature!);
    await fixture.setPayoutAccount(fixture.buyer.address);
    expect((await setupPayouts(db, env, "buyer")).state).toBe("ready");
    expect((await setListing(db, env, input)).listing?.priceUsdcMinor).toBe(
      "100000",
    );
    await fixture.setPayoutAccount(fixture.buyer.address, false);
    await expect(setupPayouts(db, env, "buyer")).rejects.toMatchObject({
      code: "PAYOUT_ACCOUNT_CLOSED",
    });
    await db
      .updateTable("profiles")
      .set({ walletAddress: fixture.other.address })
      .where("userId", "=", "buyer")
      .execute();
    await expect(setupPayouts(db, env, "buyer")).rejects.toMatchObject({
      code: "PAYOUT_ACCOUNT_CLOSED",
    });

    expect(await setupPayouts(db, env, "seller")).toMatchObject({
      state: "ready",
      txSignature: null,
    });
    await fixture.setPayoutAccount(fixture.seller.address, false);
    await expect(setupPayouts(db, env, "seller")).rejects.toMatchObject({
      code: "PAYOUT_ACCOUNT_CLOSED",
    });
    expect(fixture.signedWires.size).toBe(1);
  } finally {
    await fixture.close();
  }
});

test("unsigned purchases leave listing changes, trades and claims available and stale signing returns a typed conflict", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("mutable", "seller");
    await fixture.addCard("offered", "buyer");
    const listing = await quote(fixture, "mutable");
    const original = await preparePurchase(db, env, {
      actorUserId: "buyer",
      ...listing,
    });
    const signPurchase = async (purchase: Purchase) =>
      purchaseStatus(db, env, {
        actorUserId: "buyer",
        id: purchase.id,
        signature: await sign(purchase, fixture.buyer),
      });
    await setListing(db, env, {
      actorUserId: "seller",
      cardId: "mutable",
      priceUsdcMinor: "120000",
    });
    await expect(signPurchase(original)).rejects.toMatchObject({
      status: 409,
      code: "PRICE_CHANGED",
    });
    const repriced = await preparePurchase(db, env, {
      actorUserId: "buyer",
      ...listing,
      expectedPriceUsdcMinor: "120000",
    });
    const trade = await proposeTrade(db, {
      actorUserId: "buyer",
      offeredCardId: "offered",
      requestedCardId: "mutable",
    });
    await expect(signPurchase(repriced)).rejects.toMatchObject({
      status: 409,
      code: "TRADE_PENDING",
    });
    await decideTrade(db, {
      actorUserId: "buyer",
      tradeId: trade.id,
      action: "cancel",
    });
    expect(
      await setListing(db, env, {
        actorUserId: "seller",
        cardId: "mutable",
        priceUsdcMinor: null,
      }),
    ).toEqual({ listing: null });
    await expect(signPurchase(repriced)).rejects.toMatchObject({
      status: 409,
      code: "LISTING_UNAVAILABLE",
    });
    expect(
      (
        await prepareClaim(db, env, {
          actorUserId: "seller",
          cardId: "mutable",
        })
      ).state,
    ).toBe("submitted");
  } finally {
    await fixture.close();
  }
});

test("prepare quotas bound active messages and rolling attempts across purchases and claims", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    for (const id of ["a", "b", "c"]) {
      await fixture.addCard(id, "seller");
      expect(
        (
          await preparePurchase(db, env, {
            actorUserId: "buyer",
            ...(await quote(fixture, id)),
          })
        ).state,
      ).toBe("prepared");
    }
    await fixture.addCard("claim", "buyer");
    await expect(
      prepareClaim(db, env, { actorUserId: "buyer", cardId: "claim" }),
    ).rejects.toMatchObject({ status: 429, code: "PREPARE_LIMIT" });
    await db.updateTable("purchases").set({ state: "expired" }).execute();
    for (let attempt = 4; attempt < 12; attempt++) {
      await expect(
        preparePurchase(db, env, {
          actorUserId: "buyer",
          listingId: "missing",
          expectedPriceUsdcMinor: "100000",
        }),
      ).rejects.toMatchObject({ code: "LISTING_UNAVAILABLE" });
    }
    await expect(
      prepareClaim(db, env, { actorUserId: "buyer", cardId: "claim" }),
    ).rejects.toMatchObject({ status: 429, code: "PREPARE_LIMIT" });
    await db
      .updateTable("chain_prepare_attempts")
      .set({ createdAt: Date.now() - 61_000 })
      .execute();
    expect(
      (await prepareClaim(db, env, { actorUserId: "buyer", cardId: "claim" }))
        .state,
    ).toBe("submitted");
  } finally {
    await fixture.close();
  }
});

test("cron delivers late finality once or records a refund when the card moved or is locked", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  const now = Date.now;
  try {
    const operations = [];
    for (const cardId of ["still-owned", "moved", "locked"]) {
      await fixture.addCard(cardId, "seller");
      const order = { actorUserId: "buyer", ...(await quote(fixture, cardId)) };
      const prepared = await preparePurchase(db, env, order);
      operations.push(
        await purchaseStatus(db, env, {
          actorUserId: "buyer",
          id: prepared.id,
          signature: await sign(prepared, fixture.buyer),
        }),
      );
    }
    fixture.setHeight(200);
    const start = now();
    for (const minutes of [0, 15, 30]) {
      Date.now = () => start + minutes * 60_000;
      await reconcileChain(env);
    }
    expect(await db.selectFrom("purchases").select("state").execute()).toEqual([
      { state: "expired" },
      { state: "expired" },
      { state: "expired" },
    ]);
    const tradeCard = "new-offer";
    await fixture.addCard(tradeCard, "other");
    const proposal = await proposeTrade(db, {
      actorUserId: "other",
      offeredCardId: tradeCard,
      requestedCardId: "moved",
    });
    await decideTrade(db, {
      actorUserId: "seller",
      tradeId: proposal.id,
      action: "accept",
    });
    fixture.setHeight(100);
    expect(
      (await prepareClaim(db, env, { actorUserId: "seller", cardId: "locked" }))
        .state,
    ).toBe("submitted");
    fixture.setHeight(200);
    for (const operation of operations)
      fixture.finalize(operation.txSignature!);
    Date.now = () => start + 6 * 24 * 60 * 60_000;
    await reconcileChain(env);
    expect(
      await db
        .selectFrom("purchases")
        .select(["cardId", "state", "failureCode"])
        .orderBy("cardId")
        .execute(),
    ).toEqual([
      {
        cardId: "locked",
        state: "refund_required",
        failureCode: "REFUND_REQUIRED",
      },
      {
        cardId: "moved",
        state: "refund_required",
        failureCode: "REFUND_REQUIRED",
      },
      { cardId: "still-owned", state: "settled", failureCode: null },
    ]);
    const before = fixture.historyChecks;
    await reconcileChain(env);
    expect(fixture.historyChecks).toBe(before + 1);
    expect(
      await db
        .selectFrom("cards")
        .select(["id", "ownerUserId"])
        .where("id", "in", ["locked", "moved", "still-owned"])
        .orderBy("id")
        .execute(),
    ).toEqual([
      { id: "locked", ownerUserId: "seller" },
      { id: "moved", ownerUserId: "other" },
      { id: "still-owned", ownerUserId: "buyer" },
    ]);
  } finally {
    Date.now = now;
    await fixture.close();
  }
});

test("a rolling global free-claim budget reserves a single slot across accounts", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  env.FREE_CLAIMS_DAILY_BUDGET = "1";
  try {
    await fixture.addCard("free-one", "buyer");
    await fixture.addCard("free-two", "seller");
    const outcomes = await Promise.allSettled([
      prepareClaim(db, env, { actorUserId: "buyer", cardId: "free-one" }),
      prepareClaim(db, env, { actorUserId: "seller", cardId: "free-two" }),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.find((result) => result.status === "rejected")?.reason,
    ).toMatchObject({ status: 503, code: "FREE_CLAIM_BUDGET_EXHAUSTED" });
    expect(fixture.signedWires.size).toBe(1);
    const { actorUserId } = await db
      .selectFrom("claims")
      .select("actorUserId")
      .executeTakeFirstOrThrow();
    const retry =
      actorUserId === "buyer"
        ? { actorUserId: "seller", cardId: "free-two" }
        : { actorUserId: "buyer", cardId: "free-one" };
    await db
      .updateTable("claims")
      .set({ createdAt: Date.now() - 25 * 60 * 60_000 })
      .execute();
    expect((await prepareClaim(db, env, retry)).state).toBe("submitted");
  } finally {
    await fixture.close();
  }
});

test("a depleted sponsor cannot sign a purchase, claim or payout setup and the balance cache expires", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  const now = Date.now;
  try {
    fixture.setSponsorBalance(99_999_999);
    await fixture.addCard("sold", "seller");
    await fixture.addCard("free", "buyer");
    const prepared = await preparePurchase(db, env, {
      actorUserId: "buyer",
      ...(await quote(fixture, "sold")),
    });
    for (const attempt of [
      async () =>
        purchaseStatus(db, env, {
          actorUserId: "buyer",
          id: prepared.id,
          signature: await sign(prepared, fixture.buyer),
        }),
      () => prepareClaim(db, env, { actorUserId: "buyer", cardId: "free" }),
      () => setupPayouts(db, env, "other"),
    ]) {
      await expect(attempt()).rejects.toMatchObject({
        status: 503,
        code: "SPONSOR_UNAVAILABLE",
      });
    }
    expect(fixture.signedWires.size).toBe(0);
    fixture.setSponsorBalance(100_000_000);
    await expect(setupPayouts(db, env, "other")).rejects.toMatchObject({
      code: "SPONSOR_UNAVAILABLE",
    });
    const resumed = now() + 60_001;
    Date.now = () => resumed;
    expect((await setupPayouts(db, env, "other")).state).toBe("submitted");
  } finally {
    Date.now = now;
    await fixture.close();
  }
});

test("purchases and payout setup require the Anchor mint and treasury and cache a validated config", async () => {
  const fixture = await chainFixture();
  const { db, env } = fixture;
  try {
    await fixture.addCard("config", "seller");
    const order = { actorUserId: "buyer", ...(await quote(fixture, "config")) };
    expect(fixture.configReads).toBe(1);
    for (const wrongConfig of [
      { ...env, TREASURY_WALLET: fixture.other.address },
      { ...env, USDC_MINT: fixture.other.address },
    ]) {
      await expect(
        preparePurchase(db, wrongConfig, order),
      ).rejects.toMatchObject({ status: 503, code: "CHAIN_NOT_CONFIGURED" });
      await expect(
        setupPayouts(db, wrongConfig, "buyer"),
      ).rejects.toMatchObject({ status: 503, code: "CHAIN_NOT_CONFIGURED" });
    }
    const before = fixture.configReads;
    const prepared = await preparePurchase(db, env, order);
    await expect(
      purchaseStatus(
        db,
        { ...env, TREASURY_WALLET: fixture.other.address },
        {
          actorUserId: "buyer",
          id: prepared.id,
          signature: await sign(prepared, fixture.buyer),
        },
      ),
    ).rejects.toMatchObject({ status: 503, code: "CHAIN_NOT_CONFIGURED" });
    expect(fixture.configReads).toBe(before + 1);
    expect(fixture.signedWires.size).toBe(0);
  } finally {
    await fixture.close();
  }
});
