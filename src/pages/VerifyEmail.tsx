import { useEffect, useState } from "react";
import { Alert, Card } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { HapticButton as Button } from "../components/HapticButton";
import { OtpInput } from "../components/ui/otp-input";
import { Page, PageHeader } from "../components/Page";
import { authClient } from "../lib/auth-client";
import { haptic } from "../lib/haptics";

type Step =
  { kind: "ready" } | { kind: "code"; sentAt: number } | { kind: "verified" };

export default function VerifyEmail() {
  const session = authClient.useSession();
  const user = session.data?.user;
  // Bind this screen to the account that opened it, including across tabs.
  return user ? (
    <Verification key={user.id} user={user} refresh={() => session.refetch()} />
  ) : null;
}

function Verification({
  user,
  refresh,
}: {
  user: { id: string; email: string; emailVerified: boolean };
  refresh: () => Promise<unknown>;
}) {
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const [pending, setPending] = useState<"send" | "verify" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [inputKey, setInputKey] = useState(0);
  const verified = user.emailVerified || step.kind === "verified";
  const remaining =
    step.kind === "code"
      ? Math.max(0, Math.ceil((step.sentAt + 60_000 - now) / 1000))
      : 0;
  useEffect(() => {
    if (step.kind !== "code") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);
  const fetchOptions = { headers: { "x-wikigems-account": user.id } };
  function fail(cause: unknown) {
    setError(cause instanceof Error ? cause.message : "Please try again.");
    haptic("error");
  }
  async function send() {
    if (pending || remaining > 0) return;
    setPending("send");
    setError("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: user.email,
        type: "email-verification",
        fetchOptions,
      });
      if (result.error)
        throw new Error(
          result.error.message ||
            "We could not send the code. Please try again.",
        );
      setCode("");
      setInputKey((value) => value + 1);
      const sentAt = Date.now();
      setNow(sentAt);
      setStep({ kind: "code", sentAt });
      haptic("success");
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(null);
    }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || code.length !== 6) return;
    setPending("verify");
    setError("");
    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: user.email,
        otp: code,
        fetchOptions,
      });
      if (result.error)
        throw new Error(
          result.error.message ||
            "That code did not work. Check it or request a new one.",
        );
      setStep({ kind: "verified" });
      haptic("success");
      await refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(null);
    }
  }
  return (
    <Page>
      <div className="mx-auto max-w-xl space-y-6">
        <Link to="/account" className="button button--ghost w-fit">
          Back to account
        </Link>
        <PageHeader
          eyebrow="Your account"
          title={verified ? "Email verified." : "Verify your email."}
          description={
            verified
              ? "Your account email is confirmed."
              : "An optional step to confirm your email belongs to you."
          }
        />
        <Card className="p-4 sm:p-6">
          <Card.Header>
            <Card.Title>
              {verified
                ? "You're all set"
                : step.kind === "code"
                  ? "Check your inbox"
                  : "Get a verification code"}
            </Card.Title>
            <Card.Description className="break-all">
              {user.email}
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-5">
            {error && (
              <Alert status="danger" role="alert">
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {verified ? (
              <>
                <p role="status" className="text-sm text-muted">
                  Your email has been verified. You can return to your account.
                </p>
                <Link to="/account" className="button button--primary">
                  Return to account
                </Link>
              </>
            ) : step.kind === "ready" ? (
              <>
                <p className="text-sm text-muted">
                  We'll email you a six-digit code. It expires in 10 minutes.
                </p>
                <Button
                  className="w-full"
                  isPending={pending === "send"}
                  onPress={() => void send()}
                >
                  Send verification code
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  isDisabled={pending !== null}
                  onPress={() => setStep({ kind: "code", sentAt: 0 })}
                >
                  I already have a code
                </Button>
              </>
            ) : (
              <form
                onSubmit={(event) => void verify(event)}
                className="space-y-5"
              >
                <p id="code-help" className="text-sm text-muted">
                  Enter the six-digit code sent to your email. Use the newest
                  code; it expires in 10 minutes.
                </p>
                <OtpInput
                  key={inputKey}
                  size="sm"
                  length={6}
                  autoFocus
                  type="numbers"
                  role="group"
                  aria-label="Email verification code"
                  aria-describedby="code-help"
                  status={error ? "error" : "idle"}
                  disabled={pending !== null}
                  slotClassName="h-12 w-[clamp(2rem,10vw,2.5rem)]"
                  onChange={(value) => {
                    setCode(value);
                    setError("");
                  }}
                />
                <Button
                  type="submit"
                  className="w-full"
                  feedback="confirm"
                  isDisabled={code.length !== 6 || pending !== null}
                  isPending={pending === "verify"}
                >
                  Verify email
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  isDisabled={remaining > 0 || pending !== null}
                  isPending={pending === "send"}
                  onPress={() => void send()}
                >
                  {remaining > 0
                    ? `Resend code in ${remaining}s`
                    : "Resend code"}
                </Button>
                <p className="text-xs text-muted">
                  If the email hasn't arrived, check your spam folder or resend
                  after a minute.
                </p>
              </form>
            )}
          </Card.Content>
        </Card>
      </div>
    </Page>
  );
}
