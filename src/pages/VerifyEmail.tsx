import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { Effect } from "effect";
import { Page, PageHeader } from "../components/Page";
import { Button, buttonClass } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Alert } from "../components/ui/feedback";
import { OtpInput } from "../components/ui/otp-input";
import { haptic } from "../lib/haptics";
import { useSession } from "../lib/session";
import { runUi } from "../runtime";
import { Auth, type AuthError } from "../services/auth";

type Step =
  { kind: "ready" } | { kind: "code"; sentAt: number } | { kind: "verified" };

export default function VerifyEmail() {
  const session = useSession();
  // Bind this screen to the account that opened it, including across tabs.
  return (
    <Show when={session().data?.user.id} keyed>
      {(userId) => <Verification userId={userId} />}
    </Show>
  );
}

function Verification(props: { userId: string }) {
  const session = useSession();
  const user = () => {
    const current = session().data?.user;
    return {
      id: props.userId,
      email: current?.email ?? "",
      emailVerified: current?.emailVerified ?? false,
    };
  };
  const [step, setStep] = createSignal<Step>({ kind: "ready" });
  const [pending, setPending] = createSignal<"send" | "verify" | null>(null);
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal("");
  const [now, setNow] = createSignal(Date.now());
  const [inputKey, setInputKey] = createSignal(0);
  const verified = () => user().emailVerified || step().kind === "verified";
  const remaining = createMemo(() => {
    const current = step();
    return current.kind === "code"
      ? Math.max(0, Math.ceil((current.sentAt + 60_000 - now()) / 1000))
      : 0;
  });

  // Tick once a second while a code is outstanding, to run the resend timer.
  createEffect(
    () => step().kind === "code",
    (waiting) => {
      if (!waiting) return;
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    },
  );

  const fail = (failure: AuthError) => {
    setError(failure.message || "Please try again.");
    haptic("error");
  };

  function send() {
    if (pending() || remaining() > 0) return;
    const account = user();
    setPending("send");
    setError("");
    void runUi(
      Auth.use((auth) => auth.sendVerificationCode(account)),
      fail,
    ).then((outcome) => {
      setPending(null);
      if (!outcome.ok) return;
      setCode("");
      setInputKey((value) => value + 1);
      const sentAt = Date.now();
      setNow(sentAt);
      setStep({ kind: "code", sentAt });
      haptic("success");
    });
  }

  function verify(event: SubmitEvent) {
    event.preventDefault();
    if (pending() || code().length !== 6) return;
    const account = user();
    const entered = code();
    setPending("verify");
    setError("");
    void runUi(
      Auth.use((auth) => auth.verifyEmail(account, entered)).pipe(
        Effect.andThen(Auth.use((auth) => auth.refresh)),
      ),
      fail,
    ).then((outcome) => {
      setPending(null);
      if (!outcome.ok) return;
      setStep({ kind: "verified" });
      haptic("success");
    });
  }

  return (
    <Page>
      <div class="mx-auto max-w-xl space-y-6">
        <Link to="/account" class={[buttonClass("ghost"), "w-fit"].join(" ")}>
          Back to account
        </Link>
        <PageHeader
          eyebrow="Your account"
          title={verified() ? "Email verified." : "Verify your email."}
          description={
            verified()
              ? "Your account email is confirmed."
              : "An optional step to confirm your email belongs to you."
          }
        />
        <Card class="sm:p-1">
          <CardHeader>
            <CardTitle>
              {verified()
                ? "You're all set"
                : step().kind === "code"
                  ? "Check your inbox"
                  : "Get a verification code"}
            </CardTitle>
            <CardDescription class="break-all">{user().email}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <Show when={error()}>
              <Alert status="danger" role="alert">
                {error()}
              </Alert>
            </Show>
            <Show
              when={!verified()}
              fallback={
                <>
                  <p role="status" class="text-sm text-muted">
                    Your email has been verified. You can return to your
                    account.
                  </p>
                  <Link to="/account" class={buttonClass("primary")}>
                    Return to account
                  </Link>
                </>
              }
            >
              <Show
                when={step().kind === "code"}
                fallback={
                  <>
                    <p class="text-sm text-muted">
                      We'll email you a six-digit code. It expires in 10
                      minutes.
                    </p>
                    <Button
                      class="w-full"
                      pending={pending() === "send"}
                      onClick={send}
                    >
                      Send verification code
                    </Button>
                    <Button
                      variant="secondary"
                      class="w-full"
                      disabled={pending() !== null}
                      onClick={() => setStep({ kind: "code", sentAt: 0 })}
                    >
                      I already have a code
                    </Button>
                  </>
                }
              >
                <form onSubmit={verify} class="space-y-5">
                  <p id="code-help" class="text-sm text-muted">
                    Enter the six-digit code sent to your email. Use the newest
                    code; it expires in 10 minutes.
                  </p>
                  {/* A fresh code remounts the field, clearing the old digits. */}
                  <Show when={`code-${inputKey()}`} keyed>
                    {(_key) => (
                      <OtpInput
                        length={6}
                        autoFocus
                        type="numbers"
                        role="group"
                        aria-label="Email verification code"
                        aria-describedby="code-help"
                        status={error() ? "error" : "idle"}
                        disabled={pending() !== null}
                        onChange={(value) => {
                          setCode(value);
                          setError("");
                        }}
                      />
                    )}
                  </Show>
                  <Button
                    type="submit"
                    class="w-full"
                    feedback="confirm"
                    disabled={code().length !== 6 || pending() !== null}
                    pending={pending() === "verify"}
                  >
                    Verify email
                  </Button>
                  <Button
                    class="w-full"
                    variant="secondary"
                    disabled={remaining() > 0 || pending() !== null}
                    pending={pending() === "send"}
                    onClick={send}
                  >
                    {remaining() > 0
                      ? `Resend code in ${remaining()}s`
                      : "Resend code"}
                  </Button>
                  <p class="text-xs text-muted">
                    If the email hasn't arrived, check your spam folder or
                    resend after a minute.
                  </p>
                </form>
              </Show>
            </Show>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
