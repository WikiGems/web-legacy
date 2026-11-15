-- Earlier passkey registrations marked email ownership as verified without a challenge.
-- No email verification existed before this migration; remove those unproven claims.
UPDATE "user" SET "emailVerified" = 0;

CREATE TABLE "rateLimit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);
