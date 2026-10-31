import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { handleAccount } from "../worker/account";
import { cleanupAvatars } from "../worker/avatars";
import { accountFixture } from "./account-fixture";
import { Schema } from "effect";
import { AccountProfileSchema } from "../shared/account";

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7yQAAAAASUVORK5CYII=",
  ),
  (char) => char.charCodeAt(0),
);
let fixture: Awaited<ReturnType<typeof accountFixture>>;
let alice: Awaited<ReturnType<typeof fixture.addUser>>;
let errors: ReturnType<typeof spyOn>;
beforeEach(async () => {
  fixture = await accountFixture();
  alice = await fixture.addUser("Alice");
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  errors.mockRestore();
  await fixture.cleanup();
});

async function upload(bucket = fixture.env.AVATARS) {
  return handleAccount(
    new Request(`${fixture.env.BETTER_AUTH_URL}/api/profile/avatar`, {
      method: "PUT",
      body: png,
      headers: {
        cookie: alice.cookie,
        origin: fixture.env.BETTER_AUTH_URL,
        "x-wikigems-account": alice.user.id,
      },
    }),
    { ...fixture.env, AVATARS: bucket },
    fixture.auth,
  );
}
async function currentKey() {
  const result = await fixture.client.execute({
    sql: "select avatarKey from account_profiles where userId = ?",
    args: [alice.user.id],
  });
  const key = result.rows[0]?.avatarKey;
  if (typeof key !== "string")
    throw new Error("Expected an active avatar key.");
  return key;
}
async function currentProfile() {
  return Schema.decodeUnknownSync(AccountProfileSchema)(
    await (await fixture.request("/api/profile", alice.cookie)).json(),
  );
}
async function currentPicture() {
  const profile = await currentProfile();
  if (!profile.image) throw new Error("Expected a current profile picture.");
  return { ...profile, image: profile.image };
}
async function queuedKeys() {
  return (
    await fixture.client.execute(
      "select objectKey from avatar_cleanup order by objectKey",
    )
  ).rows.map((row) => String(row.objectKey));
}
function overrideBucket(
  overrides: Partial<Pick<R2Bucket, "put" | "delete">>,
): R2Bucket {
  return new Proxy(fixture.env.AVATARS, {
    get(target, property) {
      if (property === "put" && overrides.put) return overrides.put;
      if (property === "delete" && overrides.delete) return overrides.delete;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("R2 avatar lifecycle", () => {
  test("the generic auth endpoint cannot bypass R2 by storing image data in Turso", async () => {
    await upload();
    const original = await currentPicture();
    const response = await fixture.request(
      "/api/auth/update-user",
      alice.cookie,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: "data:image/png;base64,unbounded-image-data",
        }),
      },
    );
    expect(response.status).toBe(400);
    expect((await currentPicture()).image).toBe(original.image);
    const stored = await fixture.client.execute({
      sql: "select image from user where id = ?",
      args: [alice.user.id],
    });
    expect(stored.rows[0]?.image).toBe(original.image);
  });
  test("stores raw bytes and HTTP metadata in R2, with only an object key in SQL", async () => {
    expect((await upload()).status).toBe(200);
    const key = await currentKey();
    const object = await fixture.env.AVATARS.get(key);
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    if (!object) throw new Error("Expected the stored R2 picture.");
    expect(new Uint8Array(await object.arrayBuffer())).toEqual(png);
    const columns = (
      await fixture.client.execute("pragma table_info(account_profiles)")
    ).rows.map((row) => row.name);
    expect(columns).toEqual(["userId", "username", "xHandle", "avatarKey"]);
    expect(await queuedKeys()).toEqual([]);
    const profile = await currentPicture();
    const response = await fixture.request(profile.image, alice.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(object?.httpEtag);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("replaces a picture without serving old versions or leaking the old object", async () => {
    await upload();
    const oldKey = await currentKey();
    const old = await currentPicture();
    expect((await upload()).status).toBe(200);
    const newKey = await currentKey();
    expect(newKey).not.toBe(oldKey);
    expect(await fixture.env.AVATARS.head(oldKey)).toBeNull();
    expect(await fixture.env.AVATARS.head(newKey)).not.toBeNull();
    expect((await fixture.request(old.image, alice.cookie)).status).toBe(404);
    expect(await queuedKeys()).toEqual([]);
  });

  test("an uncertain R2 upload preserves the old picture and leaves durable cleanup", async () => {
    await upload();
    const oldKey = await currentKey();
    const failing = overrideBucket({
      put: async (key, bytes, options) => {
        await fixture.env.AVATARS.put(key, bytes, options);
        throw new Error("Simulated lost R2 response after writing.");
      },
    });
    expect((await upload(failing)).status).toBe(503);
    expect(await currentKey()).toBe(oldKey);
    const pending = await queuedKeys();
    expect(pending).toHaveLength(1);
    const pendingKey = pending[0];
    if (!pendingKey) throw new Error("Missing pending upload.");
    expect(await fixture.env.AVATARS.head(pendingKey)).not.toBeNull();
    await fixture.client.execute("update avatar_cleanup set notBefore = 0");
    await cleanupAvatars(fixture.env);
    expect(await fixture.env.AVATARS.head(pendingKey)).toBeNull();
    expect(await fixture.env.AVATARS.head(oldKey)).not.toBeNull();
    expect(await queuedKeys()).toEqual([]);
  });

  test("a database publication failure rolls back the reference and cleans the uploaded object later", async () => {
    await upload();
    const oldKey = await currentKey();
    const old = await currentPicture();
    await fixture.client.executeMultiple(
      "create trigger fail_avatar_publication before update of image on user begin select raise(abort, 'Simulated DB failure'); end;",
    );
    expect((await upload()).status).toBe(503);
    expect(await currentKey()).toBe(oldKey);
    expect((await currentProfile()).image).toBe(old.image);
    const pending = await queuedKeys();
    expect(pending).toHaveLength(1);
    await fixture.client.execute("update avatar_cleanup set notBefore = 0");
    await cleanupAvatars(fixture.env);
    expect(await queuedKeys()).toEqual([]);
    expect(await fixture.env.AVATARS.head(oldKey)).not.toBeNull();
    for (const key of pending)
      expect(await fixture.env.AVATARS.head(key)).toBeNull();
  });

  test("R2 deletion failures retain a cleanup record and never roll back the new picture", async () => {
    await upload();
    const oldKey = await currentKey();
    const failing = overrideBucket({
      delete: async () => {
        throw new Error("Simulated R2 outage.");
      },
    });
    expect((await upload(failing)).status).toBe(200);
    const newKey = await currentKey();
    expect(newKey).not.toBe(oldKey);
    expect(await queuedKeys()).toEqual([oldKey]);
    expect(await fixture.env.AVATARS.head(oldKey)).not.toBeNull();
    await expect(
      cleanupAvatars({ ...fixture.env, AVATARS: failing }),
    ).rejects.toThrow("cleanup records were retained");
    expect(await queuedKeys()).toEqual([oldKey]);
    await cleanupAvatars(fixture.env);
    expect(await fixture.env.AVATARS.head(oldKey)).toBeNull();
    expect(await fixture.env.AVATARS.head(newKey)).not.toBeNull();
    expect(await queuedKeys()).toEqual([]);
  });

  test("an expired upload cannot be published after cleanup has claimed it", async () => {
    await upload();
    const oldKey = await currentKey();
    const expired = overrideBucket({
      put: async (key, bytes, options) => {
        const result = await fixture.env.AVATARS.put(key, bytes, options);
        await fixture.client.execute({
          sql: "update avatar_cleanup set notBefore = 0 where objectKey = ?",
          args: [key],
        });
        await cleanupAvatars(fixture.env);
        return result;
      },
    });
    expect((await upload(expired)).status).toBe(503);
    expect(await currentKey()).toBe(oldKey);
    expect(await fixture.env.AVATARS.head(oldKey)).not.toBeNull();
    expect(await queuedKeys()).toHaveLength(1);
    await fixture.client.execute("update avatar_cleanup set notBefore = 0");
    await cleanupAvatars(fixture.env);
    expect(await queuedKeys()).toEqual([]);
  });

  test("a late R2 write after pending cleanup is queued again instead of becoming an orphan", async () => {
    await upload();
    const oldKey = await currentKey();
    let lateKey = "";
    const late = overrideBucket({
      put: async (key, bytes, options) => {
        lateKey = key;
        await fixture.client.execute({
          sql: "update avatar_cleanup set notBefore = 0 where objectKey = ?",
          args: [key],
        });
        await cleanupAvatars(fixture.env);
        return fixture.env.AVATARS.put(key, bytes, options);
      },
    });
    expect((await upload(late)).status).toBe(503);
    expect(await currentKey()).toBe(oldKey);
    expect(await queuedKeys()).toEqual([lateKey]);
    expect(await fixture.env.AVATARS.head(lateKey)).not.toBeNull();
    await fixture.client.execute("update avatar_cleanup set notBefore = 0");
    await cleanupAvatars(fixture.env);
    expect(await fixture.env.AVATARS.head(lateKey)).toBeNull();
    expect(await fixture.env.AVATARS.head(oldKey)).not.toBeNull();
  });

  test("concurrent replacements leave one live object and collect both superseded objects", async () => {
    await upload();
    const original = await currentKey();
    const results = await Promise.all([upload(), upload()]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    const active = await currentKey();
    await cleanupAvatars(fixture.env);
    const list = await fixture.env.AVATARS.list({ prefix: "avatars/" });
    expect(list.objects.map((object) => object.key)).toEqual([active]);
    expect(await fixture.env.AVATARS.head(original)).toBeNull();
    expect(await queuedKeys()).toEqual([]);
  });

  test("deleting a picture clears the profile even if R2 cleanup must retry", async () => {
    await upload();
    const key = await currentKey();
    const old = await currentPicture();
    const failing = overrideBucket({
      delete: async () => {
        throw new Error("Simulated R2 outage.");
      },
    });
    const response = await handleAccount(
      new Request(`${fixture.env.BETTER_AUTH_URL}/api/profile/avatar`, {
        method: "DELETE",
        headers: {
          cookie: alice.cookie,
          origin: fixture.env.BETTER_AUTH_URL,
          "x-wikigems-account": alice.user.id,
        },
      }),
      { ...fixture.env, AVATARS: failing },
      fixture.auth,
    );
    expect(response.status).toBe(200);
    expect((await currentProfile()).image).toBeNull();
    expect((await fixture.request(old.image, alice.cookie)).status).toBe(404);
    expect(await queuedKeys()).toEqual([key]);
    await cleanupAvatars(fixture.env);
    expect(await fixture.env.AVATARS.head(key)).toBeNull();
    expect(await queuedKeys()).toEqual([]);
  });

  test("account deletion queues its R2 object through the schema trigger", async () => {
    await upload();
    const key = await currentKey();
    await fixture.client.execute("pragma foreign_keys = on");
    await fixture.client.execute({
      sql: "delete from user where id = ?",
      args: [alice.user.id],
    });
    expect(await queuedKeys()).toEqual([key]);
    await cleanupAvatars(fixture.env);
    expect(await fixture.env.AVATARS.head(key)).toBeNull();
  });
});
