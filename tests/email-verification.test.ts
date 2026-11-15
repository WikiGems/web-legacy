import { afterEach, beforeEach, expect, test } from "bun:test";
import { accountFixture } from "./account-fixture";
import { sendVerificationCode, type VerificationEmail } from "../worker/email";

let fixture: Awaited<ReturnType<typeof accountFixture>>;
let alice: Awaited<ReturnType<typeof fixture.addUser>>;
let messages: VerificationEmail[];
let deliveryFails: boolean;
let ip = 1;
beforeEach(async () => {
  messages = [];
  deliveryFails = false;
  fixture = await accountFixture("http://localhost:5173", async (message) => {
    if (deliveryFails) throw new Error("Delivery unavailable");
    messages.push(message);
  });
  alice = await fixture.addUser("Alice", false);
});
afterEach(async () => {
  await fixture.cleanup();
});

function post(
  path: string,
  body: unknown,
  cookie = alice.cookie,
  account = alice.user.id,
  address = `203.0.113.${ip++}`,
) {
  return fixture.request(`/api/auth/${path}`, cookie, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wikigems-account": account,
      "cf-connecting-ip": address,
    },
    body: JSON.stringify(body),
  });
}
const send = () =>
  post("email-otp/send-verification-otp", {
    email: alice.user.email,
    type: "email-verification",
  });
const verify = (otp: string) =>
  post("email-otp/verify-email", { email: alice.user.email, otp });
function newest() {
  const value = messages.at(-1);
  if (!value) throw new Error("Expected a delivered fixture email");
  return value.otp;
}
const wrong = () => (newest() === "000000" ? "111111" : "000000");
async function verified() {
  const result = await fixture.auth.api.getSession({
    headers: new Headers({ cookie: alice.cookie }),
  });
  return result?.user.emailVerified;
}

test("verification is optional and sends no email until explicitly requested", async () => {
  expect(await verified()).toBe(false);
  expect((await fixture.request("/api/profile", alice.cookie)).status).toBe(
    200,
  );
  expect(messages).toHaveLength(0);
  expect((await send()).status).toBe(200);
  expect(messages).toHaveLength(1);
  expect(newest()).toMatch(/^\d{6}$/);
  const rows = await fixture.client.execute(
    "select value from verification where identifier like 'email-verification-otp-%'",
  );
  expect(String(rows.rows[0]?.value)).not.toContain(newest());
  expect(await verified()).toBe(false);
  expect((await verify(newest())).status).toBe(200);
  expect(await verified()).toBe(true);
  expect((await verify(newest())).status).toBe(400);
});

test("rejects anonymous requests, another email, stale accounts and unrelated OTP features", async () => {
  expect(
    (
      await post(
        "email-otp/send-verification-otp",
        { email: alice.user.email, type: "email-verification" },
        "",
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await post("email-otp/send-verification-otp", {
        email: "other@example.com",
        type: "email-verification",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(
        "email-otp/send-verification-otp",
        { email: alice.user.email, type: "email-verification" },
        alice.cookie,
        "stale-account",
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await post("email-otp/send-verification-otp", {
        email: alice.user.email,
        type: "sign-in",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post("sign-in/email-otp", {
        email: alice.user.email,
        otp: "123456",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await post("email-otp/check-verification-otp", {
        email: alice.user.email,
        type: "email-verification",
        otp: "123456",
      })
    ).status,
  ).toBe(404);
  expect(messages).toHaveLength(0);
});

test("wrong and expired codes never verify an email", async () => {
  expect((await send()).status).toBe(200);
  expect((await verify(wrong())).status).toBe(400);
  expect(await verified()).toBe(false);
  await fixture.client.execute({
    sql: "update verification set expiresAt = ? where identifier = ?",
    args: [
      new Date(Date.now() - 1000).toISOString(),
      `email-verification-otp-${alice.user.email}`,
    ],
  });
  expect((await verify(newest())).status).toBe(400);
  expect(await verified()).toBe(false);
});

test("five wrong attempts exhaust a code even across different client addresses", async () => {
  await send();
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await verify(wrong())).status).toBe(400);
  expect((await verify(newest())).status).toBe(403);
  expect(await verified()).toBe(false);
});

test("resends have a server cooldown and rotate the usable code", async () => {
  await send();
  const old = newest();
  expect((await send()).status).toBe(429);
  expect(messages).toHaveLength(1);
  await fixture.client.execute({
    sql: "update verification set createdAt = ? where identifier = ?",
    args: [
      new Date(Date.now() - 61_000).toISOString(),
      `email-verification-otp-${alice.user.email}`,
    ],
  });
  expect((await send()).status).toBe(200);
  expect(messages).toHaveLength(2);
  if (old !== newest()) expect((await verify(old)).status).toBe(400);
  expect((await verify(newest())).status).toBe(200);
});

test("a code is consumed once when verification requests race", async () => {
  await send();
  const results = await Promise.all([verify(newest()), verify(newest())]);
  expect(results.map((value) => value.status).sort()).toEqual([200, 400]);
  expect(await verified()).toBe(true);
});

test("failed delivery never reports success or leaves a new usable code", async () => {
  deliveryFails = true;
  expect((await send()).ok).toBe(false);
  expect(messages).toHaveLength(0);
  expect(await verified()).toBe(false);
  const rows = await fixture.client.execute("select id from verification");
  expect(rows.rows).toHaveLength(0);
  deliveryFails = false;
  expect((await send()).status).toBe(200);
});

test("Resend requests use the configured sender and keep errors generic", async () => {
  let body: unknown;
  const env = {
    RESEND_API_KEY: "fixture-key",
    EMAIL_FROM: "WikiGems <hello@example.com>",
  };
  const message = { email: "alice@example.com", otp: "123456" };
  await sendVerificationCode(
    env,
    message,
    Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return Response.json({ id: "message-id" });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  expect(body).toMatchObject({ from: env.EMAIL_FROM, to: [message.email] });
  expect(body).toHaveProperty("text", expect.stringContaining(message.otp));
  await expect(sendVerificationCode({}, message)).rejects.toThrow(
    "not available yet",
  );
  await expect(
    sendVerificationCode(
      env,
      message,
      Object.assign(
        async () => new Response("private provider error", { status: 503 }),
        { preconnect: fetch.preconnect },
      ),
    ),
  ).rejects.toThrow("could not send the code");
});

test("client updates cannot self-verify and cross-origin OTP requests are rejected", async () => {
  await post("update-user", { emailVerified: true });
  expect(await verified()).toBe(false);
  const response = await fixture.auth.handler(
    new Request(
      "http://localhost:5173/api/auth/email-otp/send-verification-otp",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          cookie: alice.cookie,
          "x-wikigems-account": alice.user.id,
        },
        body: JSON.stringify({
          email: alice.user.email,
          type: "email-verification",
        }),
      },
    ),
  );
  expect(response.status).toBe(403);
  expect(messages).toHaveLength(0);
});

test("verification request rate limits are stored in the database", async () => {
  await send();
  const address = "198.51.100.55";
  for (let attempt = 0; attempt < 10; attempt++) {
    await post(
      "email-otp/verify-email",
      { email: alice.user.email, otp: wrong() },
      alice.cookie,
      alice.user.id,
      address,
    );
  }
  const limited = await post(
    "email-otp/verify-email",
    { email: alice.user.email, otp: newest() },
    alice.cookie,
    alice.user.id,
    address,
  );
  expect(limited.status).toBe(429);
  const rows = await fixture.client.execute(
    'select count from "rateLimit" where count >= 10',
  );
  expect(rows.rows.length).toBeGreaterThan(0);
  expect(await verified()).toBe(false);
});
