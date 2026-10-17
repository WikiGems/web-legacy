create table "profiles" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "walletAddress" text,
  "walletNonce" text,
  "walletNonceExpiresAt" integer,
  "packStock" integer not null default 10,
  "lastPackAt" integer not null default 0,
  "duelWins" integer not null default 0,
  "duelLosses" integer not null default 0,
  "createdAt" integer not null,
  "updatedAt" integer not null
);

create table "packs" (
  "id" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "cardCount" integer not null,
  "createdAt" integer not null
);

create table "cards" (
  "id" text not null primary key,
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
  "ownerUserId" text not null references "user" ("id") on delete cascade,
  "packId" text references "packs" ("id") on delete set null,
  "forTrade" integer not null default 0,
  "createdAt" integer not null,
  "mintedAt" integer
);

create index "cards_owner_idx" on "cards" ("ownerUserId");
create index "cards_trade_idx" on "cards" ("forTrade", "status");
create index "packs_user_idx" on "packs" ("userId");

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

create index "trades_counterparty_idx" on "trades" ("counterpartyId", "status");
create index "trades_proposer_idx" on "trades" ("proposerId", "status");
