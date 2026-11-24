create table "wallet_vaults" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "publicKey" text not null,
  "prfSalt" text not null,
  "exportedAt" integer,
  check (length("publicKey") between 32 and 44),
  check (length("prfSalt") = 43)
);

create table "wallet_vault_wrappers" (
  "userId" text not null references "wallet_vaults" ("userId") on delete cascade,
  "credentialId" text not null,
  "version" integer not null check ("version" = 1),
  "iv" text not null check (length("iv") = 16),
  "ciphertext" text not null check (length("ciphertext") = 64),
  "createdAt" integer not null,
  primary key ("userId", "credentialId"),
  check (length("credentialId") between 2 and 1364)
);
