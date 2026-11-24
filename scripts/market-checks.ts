import { strict as assert } from "node:assert";
import type { Client } from "@libsql/client";
import { address } from "@solana/kit";
import { Schema } from "effect";
import type { Page } from "playwright-core";
import {
  ClaimSchema,
  GameStateSchema,
  MarketConfigSchema,
  MarketResponseSchema,
  PayoutSetupSchema,
  PurchaseSchema,
} from "../shared/domain";
import { WalletVaultStatusSchema } from "../shared/wallet-vault";
import type { chainRpcFixture } from "../tests/chain-fixture";
import { showcaseCards } from "../src/lib/preview";

async function get<S extends Schema.ConstraintDecoder<unknown, never>>(
  page: Page,
  path: string,
  schema: S,
) {
  const response = await page.request.get(path);
  assert(response.ok(), `${path} returned ${response.status()}`);
  return Schema.decodeUnknownSync(schema)(await response.json());
}

const vault = (page: Page) =>
  get(page, "/api/wallet/vault", WalletVaultStatusSchema);
const state = (page: Page) => get(page, "/api/game/state", GameStateSchema);
const market = (page: Page) => get(page, "/api/market", MarketResponseSchema);

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

async function insertCard(
  db: Client,
  owner: string,
  card: {
    id: string;
    title: string;
    category: string;
    rarity: string;
  },
) {
  await db.execute({
    sql: "insert into cards (id, articleId, title, category, articleUrl, rarity, attack, defense, ownerUserId, createdAt) values (?, ?, ?, ?, ?, ?, 4, 5, ?, 1)",
    args: [
      card.id,
      `article-${card.id}`,
      card.title,
      card.category,
      "https://en.wikipedia.org/",
      card.rarity,
      owner,
    ],
  });
}

export async function seedCollectorCards(db: Client, page: Page) {
  const { userId } = await vault(page);
  for (const card of showcaseCards().slice(0, 8))
    await insertCard(db, userId, card);
}

export async function seedPublicListings(db: Client, seller: string) {
  await db.execute({
    sql: "insert into profiles (userId, walletAddress, createdAt, updatedAt) values (?, ?, 1, 1)",
    args: [seller, "11111111111111111111111111111111"],
  });
  for (const card of showcaseCards().slice(0, 3)) {
    await insertCard(db, seller, card);
    await db.execute({
      sql: "insert into listings (id, cardId, sellerUserId, priceUsdcMinor, createdAt, updatedAt) values (?, ?, ?, '1500000', 1, 1)",
      args: [`listing-${card.id}`, card.id, seller],
    });
  }
}

async function newCollector(
  page: Page,
  name: string,
  email: string,
  prf: boolean,
) {
  const browser = page.context().browser();
  assert(browser);
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const collector = await context.newPage();
  const errors: string[] = [];
  collector.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(collector);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasPrf: prf,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await collector.goto("/");
  await button(collector, "Start collecting").click();
  await collector.getByLabel("Collector name").fill(name);
  await collector.getByLabel("Email").fill(email);
  await button(collector, "Create passkey").click();
  await collector.waitForURL("**/play");
  return { collector, errors };
}

async function screenshot(page: Page, name: string) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const dialog = page.getByRole("dialog");
  if (await dialog.count())
    assert(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    );
  await page.screenshot({
    path: `.artifacts/market-${name}-mobile.png`,
    animations: "disabled",
  });
}

export async function checkMarket(
  seller: Page,
  db: Client,
  chain: Awaited<ReturnType<typeof chainRpcFixture>>,
) {
  const { collector: buyer, errors } = await newCollector(
    seller,
    "Buyer Collector",
    "buyer@example.com",
    true,
  );
  try {
    await seller.setViewportSize({ width: 390, height: 844 });
    const sellerVault = await vault(seller);
    const buyerVault = await vault(buyer);
    assert.equal(sellerVault.vault, null);
    assert.equal(buyerVault.vault, null);
    await db.execute({
      sql: 'update "user" set emailVerified = 1 where id = ?',
      args: [buyerVault.userId],
    });
    await insertCard(db, sellerVault.userId, {
      id: "moon",
      title: "Moon",
      category: "Science",
      rarity: "rare",
    });

    await seller.goto("/sell");
    const sellerInstall = button(seller, "Not now");
    if (await sellerInstall.isVisible()) await sellerInstall.click();
    await button(seller, "Set a price for Moon").click();
    const config = await get(seller, "/api/market/config", MarketConfigSchema);
    assert.equal(config.minPriceUsdcMinor, "100000");
    await seller.getByText("Minimum $0.10", { exact: true }).waitFor();
    await seller.getByLabel("Price in dollars").fill("0.09");
    await button(seller, "Save price").click();
    await seller
      .getByRole("alert")
      .getByText("Enter a price of at least $0.10.")
      .waitFor();
    assert.equal((await vault(seller)).vault, null);
    await seller.getByLabel("Price in dollars").fill("1.5000001");
    await button(seller, "Save price").click();
    await seller
      .getByRole("alert")
      .filter({ hasText: "up to 6 decimal places" })
      .waitFor();
    await seller.getByLabel("Price in dollars").fill("1.50");
    await seller.getByText("$0.0375", { exact: true }).waitFor();
    await seller.getByText("$1.4625", { exact: true }).waitFor();
    await screenshot(seller, "listing");
    await button(seller, "Save price").click();
    await button(seller, "Create wallet with a passkey").waitFor();
    await screenshot(seller, "seller-wallet");
    const payoutResponse = () =>
      seller.waitForResponse(
        (response) =>
          response.url().endsWith("/api/wallet/payouts") &&
          response.request().method() === "POST",
      );
    const firstPayout = payoutResponse();
    await button(seller, "Create wallet with a passkey").click();
    const submitted = await firstPayout;
    assert.equal(submitted.status(), 202);
    assert.equal(submitted.request().postData(), null);
    assert.equal(
      await submitted.request().headerValue("x-wikigems-account"),
      sellerVault.userId,
    );
    const repeatedPayout = payoutResponse();
    const payout = Schema.decodeUnknownSync(PayoutSetupSchema)(
      await submitted.json(),
    );
    assert.equal(payout.state, "submitted");
    assert(payout.txSignature);
    await seller
      .getByText("Setting up your payouts…", { exact: true })
      .waitFor();
    assert.equal((await repeatedPayout).status(), 202);
    const readyPayout = payoutResponse();
    await chain.setPayoutAccount(address(payout.walletAddress));
    chain.finalize(payout.txSignature);
    const ready = await readyPayout;
    assert.equal(ready.status(), 200);
    assert.equal(
      Schema.decodeUnknownSync(PayoutSetupSchema)(await ready.json()).state,
      "ready",
    );
    await seller.getByText("Price saved", { exact: true }).waitFor();
    assert.equal((await vault(seller)).walletAddress, payout.walletAddress);
    await button(seller, "Close card").click();
    await button(seller, "Edit price").click();
    await button(seller, "Clear price").click();
    await seller.getByText("Price cleared", { exact: true }).waitFor();
    assert.equal((await market(buyer)).listings.length, 0);
    await button(seller, "Set a price").click();
    await seller.getByLabel("Price in dollars").fill("1.50");
    await button(seller, "Save price").click();
    await seller
      .getByRole("dialog")
      .getByRole("button", { name: "Edit price · $1.50", exact: true })
      .waitFor();
    const [listing] = (await market(buyer)).listings;
    assert.equal(listing?.priceUsdcMinor, "1500000");

    await buyer.goto("/buy");
    const buyerInstall = button(buyer, "Not now");
    if (await buyerInstall.isVisible()) await buyerInstall.click();
    await button(buyer, "Buy now").click();
    await buyer.getByRole("heading", { name: "Buy Moon" }).waitFor();
    await screenshot(buyer, "checkout");
    assert.equal((await vault(buyer)).vault, null);
    await button(buyer, "Buy for $1.50").click();
    await button(buyer, "Create wallet with a passkey").waitFor();
    await screenshot(buyer, "buyer-wallet");
    await button(buyer, "Create wallet with a passkey").click();
    await buyer.getByRole("link", { name: "Add dollars" }).waitFor();
    const buyerAddress = (await vault(buyer)).walletAddress;
    assert(buyerAddress);
    await buyer.getByRole("link", { name: "Add dollars" }).click();
    await buyer.getByText("$0.00", { exact: true }).waitFor();
    const qr = buyer.getByRole("img", {
      name: "QR code for your deposit address",
    });
    assert(
      await qr.evaluate(
        (image) =>
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth > 0,
      ),
    );
    await buyer
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await button(buyer, "Copy address").click();
    assert.equal(
      await buyer.evaluate(() => navigator.clipboard.readText()),
      buyerAddress,
    );
    await chain.setBalance(address(buyerAddress), 5_000_000n);
    await button(buyer, "Refresh balance").click();
    await buyer.getByText("$5.00", { exact: true }).waitFor();
    for (const dismiss of await buyer
      .getByRole("button", { name: "Dismiss" })
      .all()) {
      if (await dismiss.isVisible()) await dismiss.click();
    }
    await buyer
      .getByRole("heading", { name: "Add dollars" })
      .scrollIntoViewIfNeeded();
    await screenshot(buyer, "add-dollars");

    await buyer.goto("/buy");
    await button(buyer, "Buy now").click();
    const changePrice = async (price: string) => {
      await seller.goto("/sell");
      await button(seller, "Edit price").click();
      await seller.getByLabel("Price in dollars").fill(price);
      await button(seller, "Save price").click();
      await seller.getByText("Price saved", { exact: true }).waitFor();
    };
    await changePrice("1.75");
    await button(buyer, "Buy for $1.50").click();
    await button(buyer, "Unlock wallet").click();
    await buyer
      .getByText("The price changed. Review the new total before buying.")
      .waitFor();
    await button(buyer, "Buy for $1.75").waitFor();
    await changePrice("1.50");
    await button(buyer, "Buy for $1.75").click();
    await button(buyer, "Buy for $1.50").waitFor();

    chain.invalidateBlockhash();
    const expiredApproval = buyer.waitForEvent("dialog");
    await button(buyer, "Buy for $1.50").click();
    await (await expiredApproval).accept();
    await buyer
      .getByRole("dialog")
      .getByText("The request expired. You can try again.", { exact: true })
      .waitFor();
    chain.restoreBlockhash();
    const approval = buyer.waitForEvent("dialog");
    const purchaseSign = buyer.waitForResponse(
      (res) =>
        /\/api\/purchases\/[^/]+\/sign$/.test(res.url()) &&
        res.request().method() === "POST",
    );
    await buyer
      .getByRole("dialog")
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    const dialog = await approval;
    assert.equal(dialog.message(), "Buy the Moon card for $1.50");
    await dialog.accept();
    const signedPurchase = Schema.decodeUnknownSync(PurchaseSchema)(
      await (await purchaseSign).json(),
    );
    assert.equal(signedPurchase.state, "submitted");
    assert(signedPurchase.txSignature);
    await buyer.getByText("Waiting for payment confirmation…").waitFor();
    const purchaseReconcile = buyer.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/purchases/${signedPurchase.id}`) &&
        response.request().method() === "POST",
    );
    chain.finalize(signedPurchase.txSignature);
    assert.equal(
      await (
        await purchaseReconcile
      )
        .request()
        .headerValue("x-wikigems-account"),
      buyerVault.userId,
    );
    await buyer
      .getByText("Card added to your collection", { exact: true })
      .waitFor();
    const [purchased] = (await state(buyer)).cards;
    assert.equal(purchased?.id, "moon");
    assert.equal((await state(seller)).cards.length, 0);
    assert.equal((await market(buyer)).listings.length, 0);

    await buyer.goto("/collection");
    await button(buyer, "View details for Moon").click();
    await button(buyer, "Own this card").click();
    await buyer.getByText("Free", { exact: true }).waitFor();
    await screenshot(buyer, "claim");
    await buyer.getByText("Advanced", { exact: true }).click();
    await buyer.getByLabel("Destination wallet address").fill("not-a-wallet");
    await button(buyer, "Move to wallet").click();
    await buyer
      .getByText("Enter a valid wallet address.", { exact: true })
      .waitFor();
    await buyer.getByLabel("Destination wallet address").clear();
    const freeClaim = buyer.waitForResponse(
      (res) =>
        res.url().endsWith("/api/cards/moon/claim") &&
        res.request().method() === "POST",
    );
    await button(buyer, "Move to wallet").click();
    const claim = Schema.decodeUnknownSync(ClaimSchema)(
      await (await freeClaim).json(),
    );
    assert.equal(claim.state, "submitted");
    assert.equal(claim.priceUsdcMinor, "0");
    assert.equal(claim.destination, buyerAddress);
    assert.equal(claim.transaction, null);
    assert(claim.txSignature);
    await buyer.getByText("Waiting for confirmation…").waitFor();
    const claimReconcile = buyer.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/claims/${claim.id}`) &&
        response.request().method() === "POST",
    );
    chain.finalize(claim.txSignature);
    assert.equal(
      await (await claimReconcile).request().headerValue("x-wikigems-account"),
      buyerVault.userId,
    );
    await buyer.getByText("Card moved to a wallet", { exact: true }).waitFor();
    const [owned] = (await state(buyer)).cards;
    assert.equal(owned?.status, "minted");
    assert.equal(owned.ownerWallet, buyerAddress);
    assert(owned.gemId);
    assert.equal((await buyer.request.get(`/g/${owned.gemId}`)).status(), 200);
    const card = buyer.getByRole("dialog");
    await card.getByText("In a wallet", { exact: true }).waitFor();
    assert.equal(
      await card.getByRole("link", { name: "View in explorer" }).count(),
      0,
    );
    await card.getByText("Advanced details", { exact: true }).click();
    await card.getByRole("link", { name: "View in explorer" }).waitFor();
    await screenshot(buyer, "owned");

    await insertCard(db, buyerVault.userId, {
      id: "mars",
      title: "Mars",
      category: "Science",
      rarity: "rare",
    });
    await buyer.goto("/collection");
    await button(buyer, "View details for Mars").click();
    await button(buyer, "Own this card").click();
    await buyer.getByText("Free", { exact: true }).waitFor();
    await button(buyer, "Move to wallet").click();
    await buyer
      .getByText("Free moves are paused for today.", { exact: true })
      .first()
      .waitFor();
    await screenshot(buyer, "paid-claim");
    const paidApproval = buyer.waitForEvent("dialog");
    const paidSign = buyer.waitForResponse(
      (res) =>
        /\/api\/claims\/[^/]+\/sign$/.test(res.url()) &&
        res.request().method() === "POST",
    );
    await button(buyer, "Move for $0.25").click();
    await button(buyer, "Unlock wallet").click();
    const paidDialog = await paidApproval;
    assert.equal(
      paidDialog.message(),
      "Move the Mars card to a wallet for $0.25",
    );
    await paidDialog.accept();
    const paid = Schema.decodeUnknownSync(ClaimSchema)(
      await (await paidSign).json(),
    );
    assert.equal(paid.priceUsdcMinor, "250000");
    assert.equal(paid.usesFreeClaim, false);
    assert(paid.txSignature);
    chain.finalize(paid.txSignature);
    await buyer
      .getByRole("dialog")
      .getByText("In a wallet", { exact: true })
      .waitFor();
    await insertCard(db, sellerVault.userId, {
      id: "venus",
      title: "Venus",
      category: "Science",
      rarity: "rare",
    });
    await seller.goto("/sell");
    await button(seller, "Set a price for Venus").click();
    await seller.getByLabel("Price in dollars").fill("0.10");
    await button(seller, "Save price").click();
    await seller.getByText("Price saved", { exact: true }).waitFor();
    await buyer.goto("/buy");
    await button(buyer, "Buy now").click();
    const refundReady = Promise.withResolvers<void>();
    await buyer.route(
      /\/api\/purchases\/[^/]+$/,
      async (route) => {
        await refundReady.promise;
        await route.continue();
      },
      { times: 1 },
    );
    const refundApproval = buyer.waitForEvent("dialog");
    const refundSign = buyer.waitForResponse(
      (response) =>
        /\/api\/purchases\/[^/]+\/sign$/.test(response.url()) &&
        response.status() === 202,
    );
    await button(buyer, "Buy for $0.10").click();
    await button(buyer, "Unlock wallet").click();
    await (await refundApproval).accept();
    const refund = Schema.decodeUnknownSync(PurchaseSchema)(
      await (await refundSign).json(),
    );
    assert(refund.txSignature);
    // Simulate late delivery after a different operation changed the card's owner.
    await db.batch(
      [
        {
          sql: "update purchases set state = 'expired', expiredAt = ? where id = ?",
          args: [Date.now(), refund.id],
        },
        {
          sql: "update cards set ownerUserId = ? where id = 'venus'",
          args: [buyerVault.userId],
        },
      ],
      "write",
    );
    chain.finalize(refund.txSignature);
    refundReady.resolve();
    const refundDialog = buyer.getByRole("dialog", { name: "Buy Venus" });
    await refundDialog
      .getByText(
        "Your payment arrived after the card was gone. We'll refund you.",
      )
      .waitFor();
    await refundDialog.getByText(refund.id, { exact: false }).waitFor();
    assert.equal(await button(buyer, "Buy for $0.10").count(), 0);

    assert.deepEqual(errors, []);
    console.log(
      "Market browser checks passed: minimum price, payout setup and retry, listing removal, deposits, price changes, expiry retry, purchase delivery and refund, and free and paid claims.",
    );
  } finally {
    await buyer.context().close();
  }
}

export async function checkTrade(owner: Page, db: Client) {
  const { collector, errors } = await newCollector(
    owner,
    "Trading Collector",
    "trader@example.com",
    false,
  );
  try {
    await insertCard(db, (await vault(owner)).userId, {
      id: "moon",
      title: "Moon",
      category: "Science",
      rarity: "rare",
    });
    await insertCard(db, (await vault(collector)).userId, {
      id: "reef",
      title: "Barrier Reef",
      category: "Nature",
      rarity: "rare",
    });
    await owner.goto("/collection");
    await button(owner, "View details for Moon").click();
    await button(owner, "List for trade").click();
    await button(owner, "Remove from trades").waitFor();
    await collector.goto("/trade");
    await button(collector, "Propose a trade for Moon").click();
    await button(collector, "Offer Barrier Reef").click();
    await button(collector, "Send trade offer").click();
    await collector.getByText("Trade proposed", { exact: true }).waitFor();
    await owner.goto("/trade");
    await button(owner, "Accept").click();
    await owner.getByText("Cards exchanged", { exact: true }).waitFor();
    assert.equal((await state(owner)).cards[0]?.id, "reef");
    assert.equal((await state(collector)).cards[0]?.id, "moon");
    assert.deepEqual(errors, []);
    console.log(
      "Trade browser checks passed: toggle, propose, accept, and ownership exchange.",
    );
  } finally {
    await collector.context().close();
  }
}
