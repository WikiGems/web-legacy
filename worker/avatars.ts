import { createDb } from "./db";
import type { Env } from "./env";

export type AvatarEnv = Pick<
  Env,
  "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN" | "AVATARS"
>;
type AvatarDb = ReturnType<typeof createDb>;
const UPLOAD_TTL_MS = 60 * 60 * 1000;

export function avatarUrl(userId: string, objectKey: string): string {
  return `/api/profile/avatar/${encodeURIComponent(userId)}?v=${objectKey.slice("avatars/".length)}`;
}

export async function collectAvatars(
  db: AvatarDb,
  bucket: R2Bucket,
): Promise<void> {
  const now = Date.now();
  const due = await db
    .selectFrom("avatar_cleanup")
    .select("objectKey")
    .where("notBefore", "<=", now)
    .orderBy("notBefore")
    .limit(100)
    .execute();
  let failed = false;
  for (const { objectKey } of due) {
    try {
      // Claim with a write: a stale SELECT must never delete a published upload.
      // Publication also writes this row, so the two operations serialize in SQL.
      const claimed = await db
        .updateTable("avatar_cleanup")
        .set({ notBefore: 0 })
        .where("objectKey", "=", objectKey)
        .where("notBefore", "<=", now)
        .returning("objectKey")
        .executeTakeFirst();
      if (!claimed) continue;
      await bucket.delete(objectKey);
      await db
        .deleteFrom("avatar_cleanup")
        .where("objectKey", "=", objectKey)
        .execute();
    } catch (error) {
      failed = true;
      console.error("Avatar cleanup will retry", { objectKey, error });
    }
  }
  if (failed)
    throw new Error(
      "Some avatar objects could not be removed; cleanup records were retained.",
    );
}

export async function cleanupAvatars(env: AvatarEnv): Promise<void> {
  const db = createDb(env);
  try {
    await collectAvatars(db, env.AVATARS);
  } finally {
    await db.destroy();
  }
}

export async function changeAvatar(input: {
  db: AvatarDb;
  bucket: R2Bucket;
  userId: string;
  picture: { bytes: Uint8Array; mime: string } | null;
}): Promise<string | null> {
  const { db, bucket, userId, picture } = input;
  const objectKey = picture ? `avatars/${crypto.randomUUID()}` : null;
  const image = objectKey ? avatarUrl(userId, objectKey) : null;
  try {
    if (picture && objectKey) {
      // Persist the cleanup intent first, including crashes between R2 and SQL.
      await db
        .insertInto("avatar_cleanup")
        .values({ objectKey, notBefore: Date.now() + UPLOAD_TTL_MS })
        .execute();
      const uploaded = await bucket.put(objectKey, picture.bytes, {
        httpMetadata: { contentType: picture.mime },
      });
      if (!uploaded) throw new Error("The picture could not be stored in R2.");
    }
    await db.transaction().execute(async (trx) => {
      if (objectKey) {
        const pending = await trx
          .deleteFrom("avatar_cleanup")
          .where("objectKey", "=", objectKey)
          .where("notBefore", ">", Date.now())
          .returning("objectKey")
          .executeTakeFirst();
        if (!pending)
          throw new Error(
            "The picture upload expired. Please upload it again.",
          );
      }
      await trx
        .insertInto("account_profiles")
        .values({ userId, avatarKey: objectKey })
        .onConflict((conflict) =>
          conflict.column("userId").doUpdateSet({ avatarKey: objectKey }),
        )
        .execute();
      await trx
        .updateTable("user")
        .set({ image })
        .where("id", "=", userId)
        .returning("id")
        .executeTakeFirstOrThrow();
    });
  } catch (error) {
    if (objectKey) {
      try {
        await db.transaction().execute(async (trx) => {
          const active = await trx
            .selectFrom("account_profiles")
            .select("userId")
            .where("avatarKey", "=", objectKey)
            .executeTakeFirst();
          if (!active) {
            // A slow R2 write can finish after the pending upload was collected.
            // Never enqueue a key that an uncertain SQL commit already published.
            await trx
              .insertInto("avatar_cleanup")
              .values({ objectKey, notBefore: Date.now() + UPLOAD_TTL_MS })
              .onConflict((conflict) =>
                conflict.column("objectKey").doNothing(),
              )
              .execute();
          }
        });
      } catch (recoveryError) {
        console.error("Could not reconcile failed avatar upload", {
          objectKey,
          error: recoveryError,
        });
      }
    }
    throw error;
  }
  // The triggers queue old keys in the same transaction as the new reference.
  // R2 deletion is retryable independently of the already-committed profile.
  try {
    await collectAvatars(db, bucket);
  } catch {
    /* The cron retries the durable cleanup queue. */
  }
  return image;
}
