import { haptic } from "../lib/haptics";
import {
  Alert,
  Card,
  Input,
  Label,
  Spinner,
  Tabs,
  TextField,
} from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { useState, useEffect, useRef } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { accountAuthClient } from "../lib/auth-client";
import { fetchOnboardingContext, runApi } from "../lib/api";
import { queueAuthToast } from "../lib/ui";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
type Busy = "idle" | "signin" | "signup";
function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}
export function AuthPage() {
  const searchParams = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const setSearchParams = (search: { mode: "signup" | "signin" }) =>
    void navigate({ to: "/login", search: { ...searchParams, ...search } });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const isSignup = searchParams.mode === "signup";
  const isAdding = searchParams.add === 1;
  const supported = passkeySupported();
  useEffect(() => {
    setBusy("idle");
    setError(null);
    const timeout = window.setTimeout(() => {
      if (searchParams.mode === "signup") nameInput.current?.focus();
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [searchParams.mode]);
  function friendlyError(value: unknown): string {
    if (value instanceof Error) {
      if (value.name === "NotAllowedError") {
        return "The passkey prompt was cancelled. Nothing was created — try again when you are ready.";
      }
      if (value.name === "InvalidStateError") {
        return "This device already has a passkey for WikiGems. Sign in instead.";
      }
      return value.message;
    }
    return "The passkey ceremony did not complete. Try again.";
  }
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supported) return;
    setError(null);
    setBusy("signin");
    try {
      const result = await accountAuthClient.signIn.passkey({
        autoFill: false,
      });
      if (result?.error)
        throw new Error(result.error.message || "Passkey sign-in failed.");
      queueAuthToast("sign-in");
      window.location.assign(isAdding ? "/account" : "/play");
    } catch (cause) {
      haptic("error");
      setError(friendlyError(cause));
      setBusy("idle");
    }
  }
  async function signUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supported) return;
    setError(null);
    setBusy("signup");
    try {
      const context = await runApi(fetchOnboardingContext(name, email));
      const result = await accountAuthClient.passkey.addPasskey({
        context: context.context,
        createSession: true,
      });
      if (result?.error)
        throw new Error(
          result.error.message || "Could not create the passkey.",
        );
      if (!result?.data)
        throw new Error("The passkey was not saved. Try again.");
      queueAuthToast("sign-up");
      window.location.assign(isAdding ? "/account" : "/play");
    } catch (cause) {
      haptic("error");
      setError(friendlyError(cause));
      setBusy("idle");
    }
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10">
      <div className="flex items-center justify-between">
        <Logo />
        <Link
          to={isAdding ? "/account" : "/"}
          className="text-sm text-muted hover:text-foreground"
        >
          {isAdding ? "Back to account" : "Back to home"}
        </Link>
      </div>
      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-2 lg:gap-24">
        <section className="hidden space-y-7 lg:block">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
            <Icon name="globe" size={30} />
          </span>
          <h2 className="max-w-lg text-5xl leading-tight font-semibold tracking-tight">
            A good place for
            <br />
            <span className="text-accent">curious minds.</span>
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-muted">
            There’s a story behind everything. Discover the articles you love,
            and give them a place in your collection.
          </p>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="shield" />
            Yours to explore. Secured with a passkey.
          </p>
        </section>
        <Card className="mx-auto w-full max-w-md p-5 sm:p-6">
          <Card.Header>
            <h1 className="text-2xl font-semibold">
              {isAdding ? "Another curious mind?" : "Welcome to WikiGems."}
            </h1>
            <Card.Description>
              {isAdding
                ? "Add an account. Your other accounts will stay signed in."
                : "A whole world of discoveries starts here."}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <Tabs
              selectedKey={isSignup ? "signup" : "signin"}
              onSelectionChange={(key) =>
                setSearchParams({
                  mode: key === "signup" ? "signup" : "signin",
                })
              }
            >
              <Tabs.List aria-label="Authentication mode" className="w-full">
                <Tabs.Tab id="signin" className="flex-1">
                  Sign in
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="signup" className="flex-1">
                  Create collector
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel id="signup" className="pt-6">
                <form onSubmit={signUp} className="space-y-5">
                  <div className="space-y-2">
                    <h2 id="auth-title" className="text-lg font-semibold">
                      Claim your collector card.
                    </h2>
                    <p className="text-sm leading-relaxed text-muted">
                      Choose a name, then create a passkey with your device. No
                      password needed.
                    </p>
                  </div>
                  <TextField
                    value={name}
                    onChange={setName}
                    isRequired
                    minLength={2}
                    maxLength={80}
                    isDisabled={busy !== "idle"}
                  >
                    <Label>Collector name</Label>
                    <Input
                      ref={nameInput}
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                    />
                  </TextField>
                  <TextField
                    value={email}
                    onChange={setEmail}
                    isRequired
                    type="email"
                    isDisabled={busy !== "idle"}
                  >
                    <Label>Email</Label>
                    <Input autoComplete="email" placeholder="ada@example.com" />
                  </TextField>
                  <Button
                    type="submit"
                    isDisabled={busy !== "idle" || !supported}
                    className="w-full"
                  >
                    {busy === "signup" ? (
                      <>
                        <Spinner size="sm" />
                        Talking to your device…
                      </>
                    ) : (
                      <>
                        <Icon name="shield" />
                        Create passkey
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs leading-relaxed text-muted">
                    Your passkey stays on your device. Your email identifies
                    your account.
                  </p>
                </form>
              </Tabs.Panel>
              <Tabs.Panel id="signin" className="pt-6">
                <form onSubmit={signIn} className="space-y-6">
                  <div className="space-y-2">
                    <h2 id="auth-title" className="text-lg font-semibold">
                      Back to the archive.
                    </h2>
                    <p className="text-sm leading-relaxed text-muted">
                      Use Face ID, Touch ID, or your security key to pick up
                      where you left off.
                    </p>
                  </div>
                  <div className="flex justify-center rounded-2xl bg-default/50 py-8">
                    <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent-soft-foreground">
                      <Icon name="shield" size={32} />
                    </span>
                  </div>
                  <Button
                    type="submit"
                    isDisabled={busy !== "idle" || !supported}
                    className="w-full"
                  >
                    {busy === "signin" ? (
                      <>
                        <Spinner size="sm" />
                        Waiting for your device…
                      </>
                    ) : (
                      <>
                        <Icon name="shield" />
                        Continue with passkey
                      </>
                    )}
                  </Button>
                </form>
              </Tabs.Panel>
            </Tabs>
            {!supported && (
              <Alert status="warning" className="mt-5">
                <Alert.Content>
                  <Alert.Title>Passkeys aren’t supported here.</Alert.Title>
                  <Alert.Description>
                    Try the latest Safari, Chrome, Edge, or Firefox.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {error && (
              <Alert status="danger" role="alert" className="mt-5">
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Card.Content>
        </Card>
      </div>
      <p className="pb-3 text-center text-xs text-muted">
        One article. One card. A world to discover.
      </p>
    </main>
  );
}
