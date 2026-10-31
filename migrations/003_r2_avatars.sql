begin immediate;

update "user" set "image" = null where "image" is not null;

create table "account_profiles_r2" (
  "userId" text not null primary key references "user" ("id") on delete cascade,
  "username" text collate nocase unique,
  "xHandle" text,
  "avatarKey" text unique,
  check ("username" is null or (
    length("username") between 3 and 24 and
    "username" not glob '*[^a-z0-9_]*'
  ))
);

insert into "account_profiles_r2" ("userId", "username", "xHandle")
select "userId", "username", "xHandle" from "account_profiles";

drop table "account_profiles";
alter table "account_profiles_r2" rename to "account_profiles";

-- Pending uploads have a deadline; retired objects are eligible immediately.
create table "avatar_cleanup" (
  "objectKey" text not null primary key,
  "notBefore" integer not null
);
create index "avatar_cleanup_due_idx" on "avatar_cleanup" ("notBefore");

create trigger "account_avatar_replaced"
after update of "avatarKey" on "account_profiles"
when old."avatarKey" is not null and old."avatarKey" is not new."avatarKey"
begin
  insert into "avatar_cleanup" ("objectKey", "notBefore") values (old."avatarKey", 0)
  on conflict ("objectKey") do update set "notBefore" = 0;
end;

create trigger "account_avatar_deleted"
after delete on "account_profiles"
when old."avatarKey" is not null
begin
  insert into "avatar_cleanup" ("objectKey", "notBefore") values (old."avatarKey", 0)
  on conflict ("objectKey") do update set "notBefore" = 0;
end;

commit;
