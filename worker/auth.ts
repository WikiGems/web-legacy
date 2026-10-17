import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import { createDb } from "./db";
import type { Env } from "./env";
import { verifyOnboardingToken } from "./onboarding";

export function createAuth(env: Env, request?: Request) {
  const db = createDb(env);
  const requestOrigin = request ? new URL(request.url).origin : "http://localhost:5173";
  const baseURL = env.BETTER_AUTH_URL || requestOrigin;
  const rpID = env.PASSKEY_RP_ID || new URL(baseURL).hostname;
  const trustedOrigins = [
    baseURL,
    ...(env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  return betterAuth({
    appName: "WikiMasters",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: {
      db,
      type: "sqlite",
    },
    emailAndPassword: {
      enabled: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      passkey({
        rpName: "WikiMasters",
        rpID,
        origin: env.PASSKEY_ORIGIN || undefined,
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) => {
            try {
              const claims = await verifyOnboardingToken(env.BETTER_AUTH_SECRET, context);
              return {
                id: claims.sub,
                name: claims.email,
                displayName: claims.name,
              };
            } catch (error) {
              throw new APIError("BAD_REQUEST", {
                message: error instanceof Error ? error.message : "Invalid onboarding context.",
              });
            }
          },
          afterVerification: async ({ ctx, context }) => {
            const claims = await verifyOnboardingToken(env.BETTER_AUTH_SECRET, context);
            const existingById = await ctx.context.internalAdapter.findUserById(claims.sub);
            if (existingById) {
              if (existingById.email !== claims.email) {
                throw new APIError("CONFLICT", { message: "This registration link is no longer valid." });
              }
              return { userId: existingById.id };
            }

            const existingByEmail = await ctx.context.internalAdapter.findUserByEmail(claims.email);
            if (existingByEmail) {
              throw new APIError("CONFLICT", {
                message: "An account already exists for this email. Sign in with your passkey instead.",
              });
            }

            const user = await ctx.context.internalAdapter.createUser(
              {
                id: claims.sub,
                name: claims.name,
                email: claims.email,
                emailVerified: true,
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

export type WikiMastersAuth = ReturnType<typeof createAuth>;
