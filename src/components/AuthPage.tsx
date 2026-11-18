import { createEffect, createSignal, Show } from "solid-js";
import { Link, useNavigate, useSearch } from "@tanstack/solid-router";
import { Api } from "@wikigems/client";
import { haptic } from "../lib/haptics";
import { queueAuthToast } from "../lib/ui";
import { runUi } from "../runtime";
import { Auth } from "../services/auth";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "./ui/card";
import { Alert, Spinner } from "./ui/feedback";
import { TextField } from "./ui/form";
import { Tabs, tabPanelProps } from "./ui/tabs";

type Busy = "idle" | "signin" | "signup";
const passkeySupported = () => "PublicKeyCredential" in window;

function friendlyError(failure: Error & { cause?: unknown }): string {
  const cause = failure.cause;
  if (cause instanceof Error) {
    if (cause.name === "NotAllowedError")
      return "The passkey prompt was cancelled. Nothing was created — try again when you are ready.";
    if (cause.name === "InvalidStateError")
      return "This device already has a passkey for WikiGems. Sign in instead.";
  }
  return failure.message || "The passkey ceremony did not complete. Try again.";
}

export function AuthPage() {
  const search = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal<Busy>("idle");
  const [error, setError] = createSignal<string | null>(null);
  let nameInput: HTMLInputElement | undefined;
  const isSignup = () => search().mode === "signup";
  const isAdding = () => search().add === 1;
  const supported = passkeySupported();
  const setMode = (mode: "signup" | "signin") =>
    void navigate({ to: "/login", search: { ...search(), mode } });

  // Switching modes clears the previous attempt; signup starts in the name field.
  createEffect(
    () => search().mode,
    (mode) => {
      setBusy("idle");
      setError(null);
      const timeout = window.setTimeout(() => {
        if (mode === "signup") nameInput?.focus();
      }, 80);
      return () => window.clearTimeout(timeout);
    },
  );

  const finish = (kind: "sign-in" | "sign-up") => {
    queueAuthToast(kind);
    // Account changes reload the page so no state leaks between accounts.
    window.location.assign(isAdding() ? "/account" : "/play");
  };
  const fail = (failure: Error & { cause?: unknown }) => {
    haptic("error");
    setError(friendlyError(failure));
    setBusy("idle");
  };

  function signIn(event: SubmitEvent) {
    event.preventDefault();
    if (!supported) return;
    setError(null);
    setBusy("signin");
    void runUi(
      Auth.use((auth) => auth.signInWithPasskey),
      fail,
    ).then((outcome) => outcome.ok && finish("sign-in"));
  }

  function signUp(event: SubmitEvent) {
    event.preventDefault();
    if (!supported) return;
    const collector = { name: name(), email: email() };
    setError(null);
    setBusy("signup");
    void runUi(
      Api.use((api) =>
        api.fetchOnboardingContext(collector.name, collector.email),
      ),
      fail,
    ).then((context) => {
      // Registration needs the server's one-time context.
      if (!context.ok) return;
      return runUi(
        Auth.use((auth) => auth.registerPasskey(context.value.context)),
        fail,
      ).then((outcome) => outcome.ok && finish("sign-up"));
    });
  }

  return (
    <main class="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10">
      <div class="flex items-center justify-between">
        <Logo />
        <Link
          to={isAdding() ? "/account" : "/"}
          class="text-sm text-muted hover:text-base-content"
        >
          {isAdding() ? "Back to account" : "Back to home"}
        </Link>
      </div>
      <div class="grid flex-1 items-center gap-12 py-12 lg:grid-cols-2 lg:gap-24">
        <section class="hidden space-y-7 lg:block">
          <span class="inline-flex size-14 items-center justify-center rounded-2xl bg-base-200">
            <Icon name="globe" size={30} />
          </span>
          <h2 class="max-w-lg text-5xl leading-tight font-semibold tracking-tight">
            A good place for
            <br />
            <span class="text-primary">curious minds.</span>
          </h2>
          <p class="max-w-md text-lg leading-relaxed text-muted">
            There’s a story behind everything. Discover the articles you love,
            and give them a place in your collection.
          </p>
          <p class="flex items-center gap-2 text-sm text-muted">
            <Icon name="shield" />
            Yours to explore. Secured with a passkey.
          </p>
        </section>
        <Card class="mx-auto w-full max-w-md">
          <CardHeader class="p-5 pb-0 sm:p-6 sm:pb-0">
            <h1 class="text-2xl font-semibold">
              {isAdding() ? "Another curious mind?" : "Welcome to WikiGems."}
            </h1>
            <CardDescription>
              {isAdding()
                ? "Add an account. Your other accounts will stay signed in."
                : "A whole world of discoveries starts here."}
            </CardDescription>
          </CardHeader>
          <CardContent class="p-5 sm:p-6">
            <Tabs
              label="Authentication mode"
              tabs={[
                { id: "signin", label: "Sign in" },
                { id: "signup", label: "Create collector" },
              ]}
              selected={isSignup() ? "signup" : "signin"}
              onSelect={setMode}
            />
            <Show when={isSignup()}>
              <div {...tabPanelProps("signup")} class="pt-6">
                <form onSubmit={signUp} class="space-y-5">
                  <div class="space-y-2">
                    <h2 id="auth-title" class="text-lg font-semibold">
                      Claim your collector card.
                    </h2>
                    <p class="text-sm leading-relaxed text-muted">
                      Choose a name, then create a passkey with your device. No
                      password needed.
                    </p>
                  </div>
                  <TextField
                    label="Collector name"
                    value={name()}
                    onChange={setName}
                    required
                    minlength={2}
                    maxlength={80}
                    disabled={busy() !== "idle"}
                    ref={nameInput}
                    autocomplete="name"
                    placeholder="Ada Lovelace"
                  />
                  <TextField
                    label="Email"
                    value={email()}
                    onChange={setEmail}
                    required
                    type="email"
                    disabled={busy() !== "idle"}
                    autocomplete="email"
                    placeholder="ada@example.com"
                  />
                  <Button
                    type="submit"
                    disabled={busy() !== "idle" || !supported}
                    class="w-full"
                  >
                    <Show
                      when={busy() === "signup"}
                      fallback={
                        <>
                          <Icon name="shield" />
                          Create passkey
                        </>
                      }
                    >
                      <Spinner size="sm" />
                      Talking to your device…
                    </Show>
                  </Button>
                  <p class="text-center text-xs leading-relaxed text-muted">
                    Your passkey stays on your device. Your email identifies
                    your account.
                  </p>
                </form>
              </div>
            </Show>
            <Show when={!isSignup()}>
              <div {...tabPanelProps("signin")} class="pt-6">
                <form onSubmit={signIn} class="space-y-6">
                  <div class="space-y-2">
                    <h2 id="auth-title" class="text-lg font-semibold">
                      Back to the archive.
                    </h2>
                    <p class="text-sm leading-relaxed text-muted">
                      Use Face ID, Touch ID, or your security key to pick up
                      where you left off.
                    </p>
                  </div>
                  <div class="flex justify-center rounded-2xl bg-base-200 py-8">
                    <span class="flex size-16 items-center justify-center rounded-full bg-base-100">
                      <Icon name="shield" size={32} />
                    </span>
                  </div>
                  <Button
                    type="submit"
                    disabled={busy() !== "idle" || !supported}
                    class="w-full"
                  >
                    <Show
                      when={busy() === "signin"}
                      fallback={
                        <>
                          <Icon name="shield" />
                          Continue with passkey
                        </>
                      }
                    >
                      <Spinner size="sm" />
                      Waiting for your device…
                    </Show>
                  </Button>
                </form>
              </div>
            </Show>
            <Show when={!supported}>
              <Alert
                status="warning"
                title="Passkeys aren’t supported here."
                class="mt-5"
              >
                Try the latest Safari, Chrome, Edge, or Firefox.
              </Alert>
            </Show>
            <Show when={error()}>
              <Alert status="danger" role="alert" class="mt-5">
                {error()}
              </Alert>
            </Show>
          </CardContent>
        </Card>
      </div>
      <p class="pb-3 text-center text-xs text-muted">
        One article. One card. A world to discover.
      </p>
    </main>
  );
}
