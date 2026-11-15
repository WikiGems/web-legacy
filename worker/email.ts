import { APIError } from "better-auth/api";
import { Schema } from "effect";
import type { Env } from "./env";

export type VerificationEmail = { email: string; otp: string };
export type EmailEnv = Pick<Env, "RESEND_API_KEY" | "EMAIL_FROM">;
const receipt = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }));

export async function sendVerificationCode(
  env: EmailEnv,
  { email, otp }: VerificationEmail,
  fetcher: typeof fetch = fetch,
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    throw new APIError("SERVICE_UNAVAILABLE", {
      message:
        "Email verification is not available yet. Please try again later.",
    });
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        subject: "Your WikiGems verification code",
        text: `Your WikiGems verification code is ${otp}.\n\nThis code expires in 10 minutes. Enter it only in WikiGems. If you did not request it, you can ignore this email.`,
      }),
    });
    if (!response.ok) throw new Error("Delivery rejected");
    receipt(await response.json());
  } catch {
    // Provider responses can contain private data; keep them out of logs and UI.
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "We could not send the code. Please try again shortly.",
    });
  }
}
