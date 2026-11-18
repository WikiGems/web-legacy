import { Context, Effect, Layer, SubscriptionRef } from "effect";
import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, multiSessionClient } from "better-auth/client/plugins";
import { setRef } from "../runtime/ref";

const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient(), multiSessionClient(), emailOTPClient()],
});
// Sign-in and sign-up ceremonies use their own endpoint, so the account
// choice made there never touches the signed-in browser session.
const accountAuthClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/account-auth",
  plugins: [passkeyClient()],
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];
export interface SessionState {
  /** The signed-in session, or null when signed out. */
  data: Session | null;
  /** Set while the session cannot be checked; sign-in state is then unknown. */
  failed: boolean;
  pending: boolean;
}
export interface DeviceAccount {
  session: { token: string };
  user: { id: string; name: string; email: string; image?: string | null };
}

/** Failure of an authentication request. `cause` keeps the browser's error. */
export class AuthError extends Error {
  readonly _tag = "AuthError";
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

type AuthResult = { data?: unknown; error?: { message?: string } | null };

// Better Auth reports failures in `result.error`; the browser's own
// ceremony errors (cancelled prompts) are thrown. Both end up typed.
const request = <T = unknown>(
  work: () => Promise<AuthResult | undefined>,
  fallback: string,
) =>
  Effect.tryPromise({
    try: async () => {
      const result = await work();
      if (result?.error) throw new Error(result.error.message || fallback);
      return result?.data as T;
    },
    catch: (cause) =>
      new AuthError(cause instanceof Error ? cause.message : fallback, cause),
  });

const asHeaders = (userId: string) => ({
  headers: { "x-wikigems-account": userId },
});

export class Auth extends Context.Service<
  Auth,
  {
    readonly session: SubscriptionRef.SubscriptionRef<SessionState>;
    readonly refresh: Effect.Effect<void>;
    readonly signInWithPasskey: Effect.Effect<void, AuthError>;
    readonly registerPasskey: (
      context: string,
    ) => Effect.Effect<void, AuthError>;
    readonly listAccounts: Effect.Effect<DeviceAccount[], AuthError>;
    readonly switchAccount: (token: string) => Effect.Effect<void, AuthError>;
    readonly logOut: (
      all: boolean,
      sessionToken: string,
    ) => Effect.Effect<void, AuthError>;
    readonly sendVerificationCode: (
      user: { id: string; email: string },
    ) => Effect.Effect<void, AuthError>;
    readonly verifyEmail: (
      user: { id: string; email: string },
      code: string,
    ) => Effect.Effect<void, AuthError>;
  }
>()("wikigems/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const read = (): SessionState => {
        const value = authClient.useSession.get();
        return {
          data: value.data ?? null,
          failed: Boolean(value.error),
          pending: value.isPending,
        };
      };
      const session = yield* SubscriptionRef.make(read());
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          authClient.useSession.subscribe(() => setRef(session, read())),
        ),
        (unsubscribe) => Effect.sync(unsubscribe),
      );

      return Auth.of({
        session,
        refresh: Effect.promise(() => authClient.useSession.get().refetch()),
        signInWithPasskey: request(
          () => accountAuthClient.signIn.passkey({ autoFill: false }),
          "Passkey sign-in failed.",
        ).pipe(Effect.asVoid),
        registerPasskey: (context) =>
          request(
            () =>
              accountAuthClient.passkey.addPasskey({
                context,
                createSession: true,
              }),
            "Could not create the passkey.",
          ).pipe(
            Effect.flatMap((passkey) =>
              passkey
                ? Effect.void
                : Effect.fail(
                    new AuthError("The passkey was not saved. Try again."),
                  ),
            ),
          ),
        listAccounts: request(
          () => authClient.multiSession.listDeviceSessions(),
          "Could not load signed-in accounts.",
        ).pipe(Effect.map((accounts) => (accounts ?? []) as DeviceAccount[])),
        switchAccount: (sessionToken) =>
          request(
            () => authClient.multiSession.setActive({ sessionToken }),
            "Could not switch accounts. Sign in again.",
          ).pipe(Effect.asVoid),
        logOut: (all, sessionToken) =>
          request(
            () =>
              all
                ? authClient.signOut()
                : authClient.multiSession.revoke({ sessionToken }),
            "Could not log out. Please try again.",
          ).pipe(Effect.asVoid),
        sendVerificationCode: (user) =>
          request(
            () =>
              authClient.emailOtp.sendVerificationOtp({
                email: user.email,
                type: "email-verification",
                fetchOptions: asHeaders(user.id),
              }),
            "We could not send the code. Please try again.",
          ).pipe(Effect.asVoid),
        verifyEmail: (user, code) =>
          request(
            () =>
              authClient.emailOtp.verifyEmail({
                email: user.email,
                otp: code,
                fetchOptions: asHeaders(user.id),
              }),
            "That code did not work. Check it or request a new one.",
          ).pipe(Effect.asVoid),
      });
    }),
  );
}
