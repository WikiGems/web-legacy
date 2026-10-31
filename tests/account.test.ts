import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleAccount } from "../worker/account";
import { createOnboardingToken } from "../worker/onboarding";
import { accountFixture } from "./account-fixture";
import { Schema } from "effect";
import { AccountProfileSchema } from "../shared/account";

const AuthenticationOptionsSchema = Schema.Struct({
  allowCredentials: Schema.optionalKey(Schema.Array(Schema.Unknown)),
});
const DeviceSessionsSchema = Schema.Array(
  Schema.Struct({ user: Schema.Struct({ id: Schema.String }) }),
);

let fixture: Awaited<ReturnType<typeof accountFixture>>;
let alice: Awaited<ReturnType<typeof fixture.addUser>>;
let bob: typeof alice;
const body = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});
beforeEach(async () => {
  fixture = await accountFixture();
  alice = await fixture.addUser("Alice");
  bob = await fixture.addUser("Bob");
});
afterEach(async () => {
  await fixture.cleanup();
});

describe("account profiles", () => {
  test("rejects a stale tab saving to a different active account", async () => {
    const response = await fixture.request("/api/profile", bob.cookie, {
      ...body({ xHandle: "alice" }),
      method: "PATCH",
      headers: { "x-wikigems-account": alice.user.id },
    });
    expect(response.status).toBe(409);
    expect(
      await (await fixture.request("/api/profile", bob.cookie)).json(),
    ).toMatchObject({ xHandle: null });
  });
  test("requires a session and rejects cross-origin writes", async () => {
    expect((await fixture.request("/api/profile")).status).toBe(401);
    for (const origin of ["https://attacker.example", ""]) {
      const response = await handleAccount(
        new Request("http://localhost:5173/api/profile", {
          ...body({ xHandle: "alice" }),
          method: "PATCH",
          headers: { cookie: alice.cookie, origin },
        }),
        fixture.env,
        fixture.auth,
      );
      expect(response.status).toBe(403);
    }
  });
  test("reserves a normalized username uniquely and keeps it on its account", async () => {
    expect(
      (
        await fixture.request(
          "/api/profile/username",
          alice.cookie,
          body({ username: "@Alice_1" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.request(
          "/api/profile/username",
          bob.cookie,
          body({ username: "ALICE_1" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.request(
          "/api/profile/username",
          alice.cookie,
          body({ username: "another" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.request(
          "/api/profile/username",
          alice.cookie,
          body({ username: "alice_1" }),
        )
      ).status,
    ).toBe(200);
    expect(
      await (await fixture.request("/api/profile", alice.cookie)).json(),
    ).toMatchObject({ username: "alice_1" });
    expect(
      await (await fixture.request("/api/profile", bob.cookie)).json(),
    ).toMatchObject({ username: null });
  });
  test("availability does not reserve, and concurrent claims have one winner", async () => {
    expect(
      await (
        await fixture.request(
          "/api/profile/username?username=collector",
          alice.cookie,
        )
      ).json(),
    ).toMatchObject({ available: true });
    const responses = await Promise.all(
      [alice, bob].map((account) =>
        fixture.request(
          "/api/profile/username",
          account.cookie,
          body({ username: "collector" }),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await (
        await fixture.request(
          "/api/profile/username?username=collector",
          alice.cookie,
        )
      ).json(),
    ).toMatchObject({ available: false });
  });
  test("rejects reserved, malformed, and oversized usernames", async () => {
    for (const username of [
      "ab",
      "invalid-name",
      "admin",
      "a".repeat(25),
      "💎💎💎",
    ]) {
      expect(
        (
          await fixture.request(
            "/api/profile/username",
            alice.cookie,
            body({ username }),
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await fixture.request(
          "/api/profile/username",
          alice.cookie,
          body({ username: 123 }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.request(
          "/api/profile/username",
          alice.cookie,
          body({ username: "a".repeat(5000) }),
        )
      ).status,
    ).toBe(413);
  });
  test("saves and removes only the active account's X.com link", async () => {
    const update = (xHandle: string) =>
      fixture.request("/api/profile", alice.cookie, {
        ...body({ xHandle }),
        method: "PATCH",
      });
    expect((await update("https://x.com/Alice_1")).status).toBe(200);
    expect(
      await (await fixture.request("/api/profile", alice.cookie)).json(),
    ).toMatchObject({ xHandle: "Alice_1" });
    expect(
      await (await fixture.request("/api/profile", bob.cookie)).json(),
    ).toMatchObject({ xHandle: null });
    for (const value of [
      "https://x.com.evil.example/alice",
      "https://x.com/alice/status/123",
      "javascript:alert(1)",
    ])
      expect((await update(value)).status).toBe(400);
    expect((await update("")).status).toBe(200);
    expect(
      await (await fixture.request("/api/profile", alice.cookie)).json(),
    ).toMatchObject({ xHandle: null });
  });
  test("stores and removes a picture without putting its bytes in session data", async () => {
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7yQAAAAASUVORK5CYII=",
      ),
      (char) => char.charCodeAt(0),
    );
    const upload = await fixture.request("/api/profile/avatar", alice.cookie, {
      method: "PUT",
      body: png,
    });
    expect(upload.status).toBe(200);
    const profile = Schema.decodeUnknownSync(AccountProfileSchema)(
      await (await fixture.request("/api/profile", alice.cookie)).json(),
    );
    if (!profile.image) throw new Error("Expected a profile picture URL.");
    expect(profile.image).toStartWith(`/api/profile/avatar/${alice.user.id}`);
    const image = await fixture.request(profile.image, bob.cookie);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
    expect(
      await (await fixture.request("/api/profile", bob.cookie)).json(),
    ).toMatchObject({ image: null });
    expect(
      (
        await fixture.request("/api/profile/avatar", alice.cookie, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      await (await fixture.request("/api/profile", alice.cookie)).json(),
    ).toMatchObject({ image: null });
    expect((await fixture.request(profile.image, bob.cookie)).status).toBe(404);
  });
  test("rejects SVG, corrupt input, and oversized picture bodies", async () => {
    expect(
      (
        await fixture.request("/api/profile/avatar", alice.cookie, {
          method: "PUT",
          body: "<svg></svg>",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.request("/api/profile/avatar", alice.cookie, {
          method: "PUT",
          body: new Uint8Array(512 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
  });
});

describe("multiple accounts", () => {
  test("adding an existing account offers passkeys beyond the active account", async () => {
    await fixture.client.execute({
      sql: "insert into passkey (id, publicKey, userId, credentialID, counter, deviceType, backedUp) values (?, ?, ?, ?, 0, ?, 0)",
      args: [
        crypto.randomUUID(),
        "AQID",
        alice.user.id,
        "AQID",
        "singleDevice",
      ],
    });
    const normal = await fixture.request(
      "/api/auth/passkey/generate-authenticate-options",
      alice.cookie,
    );
    expect(
      Schema.decodeUnknownSync(AuthenticationOptionsSchema)(await normal.json())
        .allowCredentials,
    ).toHaveLength(1);
    const addition = await fixture.request(
      "/api/account-auth/passkey/generate-authenticate-options",
      `${alice.cookie}; ${alice.multiCookie}`,
    );
    expect(addition.status).toBe(200);
    expect(
      Schema.decodeUnknownSync(AuthenticationOptionsSchema)(
        await addition.json(),
      ).allowCredentials ?? [],
    ).toHaveLength(0);
  });
  test("asks to log out before adding a sixth account", async () => {
    const others = await Promise.all(
      ["Carol", "Dave", "Eve"].map((name) => fixture.addUser(name)),
    );
    const cookies = [
      alice.cookie,
      ...[alice, bob, ...others].map((account) => account.multiCookie),
    ].join("; ");
    const response = await fixture.request(
      "/api/account-auth/passkey/generate-authenticate-options",
      cookies,
    );
    expect(response.status).toBe(409);
    expect((await fixture.request("/api/profile", alice.cookie)).status).toBe(
      200,
    );
  });
  test("adopts an existing session and lists only browser-held sessions", async () => {
    const session = await fixture.request(
      "/api/auth/get-session",
      alice.cookie,
    );
    expect(session.status).toBe(200);
    expect(
      session.headers
        .getSetCookie()
        .some((cookie) =>
          cookie.startsWith("better-auth.session_token_multi-"),
        ),
    ).toBe(true);
    const sessions = await fixture.request(
      "/api/auth/multi-session/list-device-sessions",
      `${alice.cookie}; ${alice.multiCookie}`,
    );
    expect(
      Schema.decodeUnknownSync(DeviceSessionsSchema)(await sessions.json()).map(
        (value: { user: { id: string } }) => value.user.id,
      ),
    ).toEqual([alice.user.id]);
  });
  test("switching requires a signed browser cookie for that session", async () => {
    expect(
      (
        await fixture.request(
          "/api/auth/multi-session/set-active",
          alice.cookie,
          body({ sessionToken: bob.session.token }),
        )
      ).status,
    ).toBe(401);
    const response = await fixture.request(
      "/api/auth/multi-session/set-active",
      `${alice.cookie}; ${alice.multiCookie}; ${bob.multiCookie}`,
      body({ sessionToken: bob.session.token }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: bob.user.id } });
  });
  test("logging out of one account preserves the other, and all-account logout revokes both", async () => {
    const cookies = `${alice.cookie}; ${alice.multiCookie}; ${bob.multiCookie}`;
    const response = await fixture.request(
      "/api/auth/multi-session/revoke",
      cookies,
      body({ sessionToken: alice.session.token }),
    );
    expect(response.status).toBe(200);
    const context = await fixture.auth.$context;
    expect(
      await context.internalAdapter.findSession(alice.session.token),
    ).toBeNull();
    expect(
      (await context.internalAdapter.findSession(bob.session.token))?.user.id,
    ).toBe(bob.user.id);
    expect(
      (
        await fixture.request(
          "/api/auth/sign-out",
          `${bob.cookie}; ${bob.multiCookie}`,
          body({}),
        )
      ).status,
    ).toBe(200);
    expect(
      await context.internalAdapter.findSession(bob.session.token),
    ).toBeNull();
  });
  test("new-account registration resolves onboarding instead of the active user", async () => {
    const onboarding = await createOnboardingToken(
      fixture.env.BETTER_AUTH_SECRET,
      { sub: crypto.randomUUID(), name: "Carol", email: "carol@example.com" },
    );
    const response = await fixture.request(
      `/api/account-auth/passkey/generate-register-options?context=${encodeURIComponent(onboarding.token)}`,
      `${alice.cookie}; ${alice.multiCookie}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { name: "carol@example.com" },
    });
    expect(
      (
        await fixture.request(
          "/api/account-auth/sign-out",
          alice.cookie,
          body({}),
        )
      ).status,
    ).toBe(404);
    expect((await fixture.request("/api/profile", alice.cookie)).status).toBe(
      200,
    );
  });
});
