begin;

-- Rebuild the two related tables so SQLite itself allocates non-reusable gem IDs
-- and an asset held by an external wallet can have no in-game owner.
alter table "trades" rename to "_legacy_trades";
alter table "cards" rename to "_legacy_cards";

create table "cards" (
  "gemId" integer primary key autoincrement check ("gemId" between 1 and 9007199254740991),
  "id" text not null unique,
  "articleId" text not null unique,
  "title" text not null,
  "description" text not null default '',
  "extract" text not null default '',
  "imageUrl" text,
  "articleUrl" text not null,
  "category" text not null default 'Knowledge',
  "rarity" text not null,
  "attack" integer not null,
  "defense" integer not null,
  "pageviews" integer not null default 0,
  "status" text not null default 'claimed',
  "mintAddress" text unique,
  "txSignature" text,
  "ownerWallet" text,
  "ownerUserId" text references "user" ("id") on delete set null,
  "packId" text references "packs" ("id") on delete set null,
  "forTrade" integer not null default 0,
  "createdAt" integer not null,
  "mintedAt" integer,
  "ownerCheckedAt" integer not null default 0
);

insert into "cards" (
  "id", "articleId", "title", "description", "extract", "imageUrl", "articleUrl",
  "category", "rarity", "attack", "defense", "pageviews", "status", "mintAddress",
  "txSignature", "ownerWallet", "ownerUserId", "packId", "forTrade", "createdAt", "mintedAt"
) select * from "_legacy_cards" order by "createdAt", "id";

create table "trades" (
  "id" text not null primary key,
  "proposerId" text not null references "user" ("id") on delete cascade,
  "counterpartyId" text not null references "user" ("id") on delete cascade,
  "offeredCardId" text not null references "cards" ("id") on delete cascade,
  "requestedCardId" text not null references "cards" ("id") on delete cascade,
  "status" text not null default 'proposed',
  "createdAt" integer not null,
  "updatedAt" integer not null
);

insert into "trades" select * from "_legacy_trades";
drop table "_legacy_trades";
drop table "_legacy_cards";

create index "cards_owner_idx" on "cards" ("ownerUserId");
create index "cards_trade_idx" on "cards" ("forTrade", "status");
create index "cards_owner_refresh_idx" on "cards" ("ownerCheckedAt", "gemId") where "status" = 'minted';
create index "profiles_wallet_idx" on "profiles" ("walletAddress");
create index "trades_counterparty_idx" on "trades" ("counterpartyId", "status");
create index "trades_proposer_idx" on "trades" ("proposerId", "status");
create index "trades_offered_pending_idx" on "trades" ("offeredCardId") where "status" = 'proposed';
create index "trades_requested_pending_idx" on "trades" ("requestedCardId") where "status" = 'proposed';

create table "listings" (
  "id" text not null primary key,
  "cardId" text not null references "cards" ("id"),
  "sellerUserId" text not null,
  "priceUsdcMinor" text not null,
  "createdAt" integer not null,
  "updatedAt" integer not null,
  "closedAt" integer
);
create unique index "listings_open_card_idx" on "listings" ("cardId") where "closedAt" is null;
create index "listings_open_updated_idx" on "listings" ("updatedAt") where "closedAt" is null;

create table "purchases" (
  "id" text not null primary key,
  "cardId" text not null references "cards" ("id"),
  "actorUserId" text not null,
  "listingId" text not null references "listings" ("id"),
  "sellerUserId" text not null,
  "priceUsdcMinor" text not null,
  "feeUsdcMinor" text not null,
  "state" text not null check ("state" in ('prepared', 'submitted', 'settled', 'failed', 'expired')),
  "message" text not null,
  "lastValidBlockHeight" text not null,
  "genesisHash" text not null,
  "sponsorAddress" text not null,
  "signerAddress" text not null,
  "txSignature" text unique,
  "signedTransaction" text,
  "failureCode" text,
  "createdAt" integer not null,
  "updatedAt" integer not null,
  "expiresAt" integer not null,
  check ("actorUserId" <> "sellerUserId"),
  check ("state" not in ('submitted', 'settled') or ("txSignature" is not null and "signedTransaction" is not null))
);
create unique index "purchases_active_card_idx" on "purchases" ("cardId") where "state" in ('prepared', 'submitted');
create index "purchases_reconcile_idx" on "purchases" ("state", "updatedAt");

create table "claims" (
  "id" text not null primary key,
  "cardId" text not null references "cards" ("id"),
  "actorUserId" text not null,
  "destination" text not null,
  "assetAddress" text not null,
  "priceUsdcMinor" text not null,
  "usesFreeClaim" integer not null check ("usesFreeClaim" in (0, 1)),
  "mintAuthorityAddress" text not null,
  "state" text not null check ("state" in ('prepared', 'submitted', 'settled', 'failed', 'expired')),
  "message" text not null,
  "lastValidBlockHeight" text not null,
  "genesisHash" text not null,
  "sponsorAddress" text not null,
  "signerAddress" text,
  "txSignature" text unique,
  "signedTransaction" text,
  "failureCode" text,
  "createdAt" integer not null,
  "updatedAt" integer not null,
  "expiresAt" integer not null,
  check ("state" not in ('submitted', 'settled') or ("txSignature" is not null and "signedTransaction" is not null))
);
create unique index "claims_locked_or_minted_card_idx" on "claims" ("cardId") where "state" in ('prepared', 'submitted', 'settled');
create index "claims_reconcile_idx" on "claims" ("state", "updatedAt");
create index "claims_allowance_idx" on "claims" ("actorUserId", "state") where "usesFreeClaim" = 1;

create trigger "purchases_exclude_active_claims" before insert on "purchases"
when exists (select 1 from "claims" where "cardId" = new."cardId" and "state" in ('prepared', 'submitted'))
begin
  select raise(abort, 'card has an active claim');
end;

create trigger "claims_exclude_active_purchases" before insert on "claims"
when exists (select 1 from "purchases" where "cardId" = new."cardId" and "state" in ('prepared', 'submitted'))
begin
  select raise(abort, 'card has an active purchase');
end;

commit;
