create table "account_profiles" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "username" text collate nocase unique,
  "xHandle" text,
  "avatarData" text,
  "avatarMime" text,
  "avatarVersion" text,
  check ("username" is null or (
    length("username") between 3 and 24 and
    "username" not glob '*[^a-z0-9_]*'
  ))
);
