create table "watchlist" (
  "id" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "entryId" text not null,
  "createdAt" integer not null
);

create unique index "watchlist_user_entry_idx" on "watchlist" ("userId", "entryId");
create index "watchlist_user_idx" on "watchlist" ("userId");
