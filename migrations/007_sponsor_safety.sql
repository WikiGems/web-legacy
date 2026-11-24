begin;

drop trigger "purchases_exclude_active_claims";
drop trigger "claims_exclude_active_purchases";
alter table "purchases" rename to "_legacy_purchases";
alter table "claims" rename to "_legacy_claims";
drop index "purchases_active_card_idx";
drop index "purchases_reconcile_idx";
drop index "claims_locked_or_minted_card_idx";
drop index "claims_reconcile_idx";
drop index "claims_allowance_idx";

create table "purchases" (
  "id" text not null primary key,
  "cardId" text not null references "cards" ("id"),
  "actorUserId" text not null,
  "listingId" text not null references "listings" ("id"),
  "sellerUserId" text not null,
  "priceUsdcMinor" text not null,
  "feeUsdcMinor" text not null,
  "state" text not null check ("state" in ('prepared', 'submitted', 'settled', 'failed', 'expired', 'refund_required')),
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
  "notFoundChecks" integer not null default 0,
  "firstNotFoundAt" integer,
  "lastNotFoundAt" integer,
  "expiredAt" integer,
  check ("actorUserId" <> "sellerUserId"),
  check ("state" not in ('submitted', 'settled', 'refund_required') or ("txSignature" is not null and "signedTransaction" is not null))
);
create unique index "purchases_active_card_idx" on "purchases" ("cardId") where "state" = 'submitted';
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
  "state" text not null check ("state" in ('prepared', 'submitted', 'settled', 'failed', 'expired', 'refund_required')),
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
  "notFoundChecks" integer not null default 0,
  "firstNotFoundAt" integer,
  "lastNotFoundAt" integer,
  "expiredAt" integer,
  check ("state" not in ('submitted', 'settled', 'refund_required') or ("txSignature" is not null and "signedTransaction" is not null))
);
create unique index "claims_locked_or_minted_card_idx" on "claims" ("cardId") where "state" in ('prepared', 'submitted', 'settled');
create index "claims_reconcile_idx" on "claims" ("state", "updatedAt");
create index "claims_allowance_idx" on "claims" ("actorUserId", "state") where "usesFreeClaim" = 1;

-- Existing signed wire remains eligible for settlement and late reconciliation.
insert into "purchases" (
  "id", "cardId", "actorUserId", "listingId", "sellerUserId", "feeUsdcMinor", "priceUsdcMinor",
  "state", "message", "lastValidBlockHeight", "genesisHash", "sponsorAddress",
  "signerAddress", "txSignature", "signedTransaction", "failureCode", "createdAt",
  "updatedAt", "expiresAt", "expiredAt"
)
select "id", "cardId", "actorUserId", "listingId", "sellerUserId", "feeUsdcMinor", "priceUsdcMinor",
       case when "state" = 'prepared' then 'expired' else "state" end,
       "message", "lastValidBlockHeight", "genesisHash", "sponsorAddress",
       "signerAddress", "txSignature", "signedTransaction",
       case when "state" = 'prepared' then 'TRANSACTION_EXPIRED' else "failureCode" end,
       "createdAt", "updatedAt", "expiresAt",
       case when "state" = 'expired' and "txSignature" is not null then "updatedAt" end
from "_legacy_purchases";

create index "purchases_actor_prepares_idx" on "purchases" ("actorUserId", "expiresAt") where "state" = 'prepared';
create index "purchases_late_reconcile_idx" on "purchases" ("updatedAt") where "state" = 'expired' and "txSignature" is not null;

-- Existing signed wire remains eligible for settlement and late reconciliation.
insert into "claims" (
  "id", "cardId", "actorUserId", "destination", "assetAddress", "usesFreeClaim", "mintAuthorityAddress", "priceUsdcMinor",
  "state", "message", "lastValidBlockHeight", "genesisHash", "sponsorAddress",
  "signerAddress", "txSignature", "signedTransaction", "failureCode", "createdAt",
  "updatedAt", "expiresAt", "expiredAt"
)
select "id", "cardId", "actorUserId", "destination", "assetAddress", "usesFreeClaim", "mintAuthorityAddress", "priceUsdcMinor",
       case when "state" = 'prepared' then 'expired' else "state" end,
       "message", "lastValidBlockHeight", "genesisHash", "sponsorAddress",
       "signerAddress", "txSignature", "signedTransaction",
       case when "state" = 'prepared' then 'TRANSACTION_EXPIRED' else "failureCode" end,
       "createdAt", "updatedAt", "expiresAt",
       case when "state" = 'expired' and "txSignature" is not null then "updatedAt" end
from "_legacy_claims";

create index "claims_actor_prepares_idx" on "claims" ("actorUserId", "expiresAt") where "state" = 'prepared';
create index "claims_late_reconcile_idx" on "claims" ("updatedAt") where "state" = 'expired' and "txSignature" is not null;

drop table "_legacy_purchases";
drop table "_legacy_claims";

create index "claims_free_budget_idx" on "claims" ("createdAt") where "usesFreeClaim" = 1;

create trigger "purchases_exclude_active_claims" before update of "state" on "purchases"
when new."state" = 'submitted' and exists (
  select 1 from "claims" where "cardId" = new."cardId" and "state" in ('prepared', 'submitted')
)
begin
  select raise(abort, 'card has an active claim');
end;

create trigger "claims_exclude_active_purchases" before insert on "claims"
when exists (select 1 from "purchases" where "cardId" = new."cardId" and "state" = 'submitted')
begin
  select raise(abort, 'card has an active purchase');
end;

-- Keep the account reservation even when the wallet is changed or the ATA is closed.
create table "payout_setups" (
  "userId" text not null primary key,
  "walletAddress" text not null,
  "ataAddress" text not null,
  "genesisHash" text not null,
  "message" text,
  "readyAt" integer,
  "txSignature" text unique,
  "signedTransaction" text,
  "lastValidBlockHeight" text,
  check (("txSignature" is null and "signedTransaction" is null and "lastValidBlockHeight" is null and "message" is null)
    or ("txSignature" is not null and "signedTransaction" is not null and "lastValidBlockHeight" is not null and "message" is not null))
);

create table "chain_prepare_attempts" (
  "id" integer primary key,
  "actorUserId" text not null references "user" ("id") on delete cascade,
  "createdAt" integer not null
);
create index "chain_prepare_actor_idx" on "chain_prepare_attempts" ("actorUserId", "createdAt");
create index "chain_prepare_age_idx" on "chain_prepare_attempts" ("createdAt");

commit;
