import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  createAuthEndpoint,
  getSessionFromCtx,
} from "better-auth/api";
import { emailOTP, multiSession } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { createDb } from "./db";
import type { Env } from "./env";
import { verifyOnboardingToken } from "./onboarding";
import { sendVerificationCode, type VerificationEmail } from "./email";

export function createAuth(
  env: Omit<Env, "ASSETS" | "AVATARS">,
  request?: Request,
  deliverEmail: (message: VerificationEmail) => Promise<void> = (message) =>
    sendVerificationCode(env, message),
) {
  const db = createDb(env);
  const requestOrigin = request
    ? new URL(request.url).origin
    : "http://localhost:5173";
  const baseURL = env.BETTER_AUTH_URL || requestOrigin;
  const rpID = env.PASSKEY_RP_ID || new URL(baseURL).hostname;
  const trustedOrigins = [
    baseURL,
    ...(env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  const emailVerification = emailOTP({
    otpLength: 6,
    expiresIn: 600,
    allowedAttempts: 5,
    rateLimit: { window: 60, max: 10 },
    storeOTP: "hashed",
    sendVerificationOnSignUp: false,
    disableSignUp: true,
    sendVerificationOTP: async (message) => deliverEmail(message),
  });
  // The default endpoint suppresses delivery failures as background-task errors.
  // Await Resend here so the screen only claims a code was sent after acceptance.
  const sendEndpoint = emailVerification.endpoints.sendVerificationOTP;
  emailVerification.endpoints.sendVerificationOTP = createAuthEndpoint(
    sendEndpoint.path,
    sendEndpoint.options,
    async (ctx) => {
      const otp = await emailVerification.endpoints.createVerificationOTP({
        body: ctx.body,
        context: ctx.context,
      });
      const record = await ctx.context.internalAdapter.findVerificationValue(
        `email-verification-otp-${ctx.body.email.toLowerCase()}`,
      );
      try {
        await deliverEmail({ email: ctx.body.email.toLowerCase(), otp });
      } catch (error) {
        if (record)
          await ctx.context.adapter.delete({
            model: "verification",
            where: [{ field: "id", value: record.id }],
          });
        if (error instanceof APIError) throw error;
        throw new APIError("SERVICE_UNAVAILABLE", {
          message: "We could not send the code. Please try again shortly.",
        });
      }
      return ctx.json({ success: true });
    },
  );
  return betterAuth({
    appName: "WikiGems",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    // Cloudflare supplies this header; do not trust client-controlled forwarding headers.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    database: {
      db,
      type: "sqlite",
    },
    databaseHooks: {
      user: {
        update: {
          before: async (data) => {
            if ("image" in data) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "Upload or remove your profile picture from Account settings.",
              });
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: false,
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === "/sign-in/email-otp" ||
          ctx.path === "/forget-password/email-otp"
        )
          throw new APIError("NOT_FOUND");
        if (!ctx.path.startsWith("/email-otp/")) return;
        if (
          ![
            "/email-otp/send-verification-otp",
            "/email-otp/verify-email",
          ].includes(ctx.path)
        )
          throw new APIError("NOT_FOUND");
        const session = await getSessionFromCtx(ctx);
        const origin = ctx.headers?.get("origin");
        if (!origin || !trustedOrigins.includes(origin))
          throw new APIError("FORBIDDEN", {
            message: "Untrusted request origin.",
          });
        if (!session)
          throw new APIError("UNAUTHORIZED", {
            message: "Sign in to verify your email.",
          });
        if (ctx.headers?.get("x-wikigems-account") !== session.user.id)
          throw new APIError("CONFLICT", {
            message:
              "Your active account changed. Return to Account and try again.",
          });
        const body: unknown = ctx.body;
        if (
          !body ||
          typeof body !== "object" ||
          !("email" in body) ||
          typeof body.email !== "string" ||
          body.email.toLowerCase() !== session.user.email.toLowerCase()
        )
          throw new APIError("FORBIDDEN", {
            message: "You can only verify your own account email.",
          });
        if (ctx.path === "/email-otp/send-verification-otp") {
          if (!("type" in body) || body.type !== "email-verification")
            throw new APIError("BAD_REQUEST");
          if (session.user.emailVerified)
            throw new APIError("BAD_REQUEST", {
              message: "Your email is already verified.",
            });
          const existing =
            await ctx.context.internalAdapter.findVerificationValue(
              `email-verification-otp-${session.user.email.toLowerCase()}`,
            );
          if (existing && Date.now() - existing.createdAt.getTime() < 60_000)
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Wait a minute before requesting another code.",
            });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/get-session" || !ctx.context.session) return;
        const cookie = ctx.context.authCookies.sessionToken;
        const token = ctx.context.session.session.token;
        const name = `${cookie.name}_multi-${token.toLowerCase()}`;
        if (!(await ctx.getSignedCookie(name, ctx.context.secret))) {
          await ctx.setSignedCookie(
            name,
            token,
            ctx.context.secret,
            cookie.attributes,
          );
        }
      }),
    },
    plugins: [
      multiSession(),
      emailVerification,
      passkey({
        rpName: "WikiGems",
        rpID,
        origin: env.PASSKEY_ORIGIN || undefined,
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) => {
            try {
              const claims = await verifyOnboardingToken(
                env.BETTER_AUTH_SECRET,
                context,
              );
              return {
                id: claims.sub,
                name: claims.email,
                displayName: claims.name,
              };
            } catch (error) {
              throw new APIError("BAD_REQUEST", {
                message:
                  error instanceof Error
                    ? error.message
                    : "Invalid onboarding context.",
              });
            }
          },
          afterVerification: async ({ ctx, context }) => {
            const claims = await verifyOnboardingToken(
              env.BETTER_AUTH_SECRET,
              context,
            );
            const existingById = await ctx.context.internalAdapter.findUserById(
              claims.sub,
            );
            if (existingById) {
              if (existingById.email !== claims.email) {
                throw new APIError("CONFLICT", {
                  message: "This registration link is no longer valid.",
                });
              }
              return { userId: existingById.id };
            }

            const existingByEmail =
              await ctx.context.internalAdapter.findUserByEmail(claims.email);
            if (existingByEmail) {
              throw new APIError("CONFLICT", {
                message:
                  "An account already exists for this email. Sign in with your passkey instead.",
              });
            }

            const user = await ctx.context.internalAdapter.createUser(
              {
                id: claims.sub,
                name: claims.name,
                email: claims.email,
                emailVerified: false,
                image: null,
              },
              { method: "passkey" },
            );

            return { userId: user.id };
          },
        },
      }),
    ],
  });
}

export type WikiGemsAuth = ReturnType<typeof createAuth>;
