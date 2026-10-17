import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { authClient } from "../lib/auth-client";
import { fetchOnboardingContext, runApi } from "../lib/api";
import { authMode, closeAuth, openAuth, showToast } from "../lib/ui";
import { CardBack } from "./GameCard";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

type Busy = "idle" | "signin" | "signup";

function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

export function AuthModal() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal<Busy>("idle");
  const [error, setError] = createSignal<string | null>(null);
  let nameInput: HTMLInputElement | undefined;

  const mode = () => authMode() ?? "signin";
  const isSignup = () => mode() === "signup";
  const supported = passkeySupported();

  createEffect(() => {
    if (!authMode()) {
      setBusy("idle");
      setError(null);
      return;
    }
    window.setTimeout(() => nameInput?.focus(), 80);
  });

  createEffect(() => {
    const open = authMode() !== null;
    document.body.classList.toggle("modal-open", open);
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy() === "idle") closeAuth();
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
    });
  });

  function friendlyError(value: unknown): string {
    if (value instanceof Error) {
      if (value.name === "NotAllowedError") {
        return "The passkey prompt was cancelled. Nothing was created — try again when you are ready.";
      }
      if (value.name === "InvalidStateError") {
        return "This device already has a passkey for WikiMasters. Sign in instead.";
      }
      return value.message;
    }
    return "The passkey ceremony did not complete. Try again.";
  }

  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    if (!supported) return;
    setError(null);
    setBusy("signin");
    try {
      const result = await authClient.signIn.passkey({ autoFill: false });
      if (result?.error) throw new Error(result.error.message || "Passkey sign-in failed.");
      showToast("Welcome back, collector", { body: "Your album is waiting.", tone: "success" });
      window.location.assign("/play");
    } catch (cause) {
      setError(friendlyError(cause));
      setBusy("idle");
    }
  }

  async function signUp(event: SubmitEvent) {
    event.preventDefault();
    if (!supported) return;
    setError(null);
    setBusy("signup");
    try {
      const context = await runApi(fetchOnboardingContext(name(), email()));
      const result = await authClient.passkey.addPasskey({
        context: context.context,
        createSession: true,
      });
      if (result?.error) throw new Error(result.error.message || "Could not create the passkey.");
      if (!result?.data) throw new Error("The passkey was not saved. Try again.");

      closeAuth();
      showToast("Collector card created", {
        body: "Your passkey is on this device. No password, ever.",
        tone: "success",
      });
      window.location.assign("/play");
    } catch (cause) {
      setError(friendlyError(cause));
      setBusy("idle");
    }
  }

  return (
    <Show when={authMode()}>
      <Portal>
        <div
          class="modal-scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && busy() === "idle") closeAuth();
          }}
        >
          <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div class="auth-visual">
              <div class="auth-visual-cards" aria-hidden="true">
                <CardBack size="sm" class="auth-card auth-card--one" />
                <CardBack size="sm" class="auth-card auth-card--two" />
                <CardBack size="sm" class="auth-card auth-card--three" />
              </div>
              <div class="auth-visual-copy">
                <p class="eyebrow">The Wikipedia card game</p>
                <h2>
                  Every article.
                  <br />
                  <em>One card.</em>
                </h2>
                <p>
                  Collect 1-of-1 cards pulled from Wikipedia, duel on what you know, and trade
                  before someone else claims the page.
                </p>
              </div>
              <div class="auth-visual-foot">
                <Icon name="bolt" size={14} /> Passkey-native · No password
              </div>
            </div>

            <div class="auth-main">
              <div class="auth-head">
                <Logo />
                <button class="icon-button auth-close" onClick={closeAuth} aria-label="Close dialog">
                  <Icon name="close" />
                </button>
              </div>

              <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
                <button
                  role="tab"
                  aria-selected={!isSignup()}
                  classList={{ "is-active": !isSignup() }}
                  onClick={() => {
                    setError(null);
                    openAuth("signin");
                  }}
                >
                  Sign in
                </button>
                <button
                  role="tab"
                  aria-selected={isSignup()}
                  classList={{ "is-active": isSignup() }}
                  onClick={() => {
                    setError(null);
                    openAuth("signup");
                  }}
                >
                  Create collector
                </button>
              </div>

              <Show
                when={isSignup()}
                fallback={
                  <form onSubmit={signIn} class="auth-form">
                    <h3 id="auth-title">Back to the archive.</h3>
                    <p class="auth-sub">
                      Use the passkey stored on this device. Your browser will ask for Face ID,
                      Touch ID, or your security key.
                    </p>

                    <button
                      class="btn btn-primary btn-lg auth-submit"
                      type="submit"
                      disabled={busy() !== "idle" || !supported}
                    >
                      <Show
                        when={busy() === "signin"}
                        fallback={
                          <>
                            <Icon name="bolt" size={18} /> Continue with passkey
                          </>
                        }
                      >
                        <span class="spinner" /> Waiting for your device…
                      </Show>
                    </button>

                    <Show when={!supported}>
                      <p class="auth-error">
                        This browser does not support passkeys. Try the latest Safari, Chrome, Edge,
                        or Firefox.
                      </p>
                    </Show>
                    <Show when={error()}>
                      <p class="auth-error" role="alert">
                        {error()}
                      </p>
                    </Show>
                    <p class="auth-fineprint">
                      New here?{" "}
                      <button type="button" class="text-link" onClick={() => openAuth("signup")}>
                        Create a collector with a passkey
                      </button>
                    </p>
                  </form>
                }
              >
                <form onSubmit={signUp} class="auth-form">
                  <h3 id="auth-title">Claim your collector card.</h3>
                  <p class="auth-sub">
                    Pick the name other collectors will see. Your passkey is created next — there is
                    no password step.
                  </p>

                  <label class="field">
                    <span>Collector name</span>
                    <input
                      ref={nameInput}
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                      placeholder="Ada Lovelace"
                      autocomplete="name"
                      required
                      minlength="2"
                      maxlength="80"
                    />
                  </label>

                  <label class="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={email()}
                      onInput={(event) => setEmail(event.currentTarget.value)}
                      placeholder="ada@example.com"
                      autocomplete="email"
                      required
                    />
                    <small>Used to identify your account. No marketing, no password.</small>
                  </label>

                  <button
                    class="btn btn-primary btn-lg auth-submit"
                    type="submit"
                    disabled={busy() !== "idle" || !supported}
                  >
                    <Show
                      when={busy() === "signup"}
                      fallback={
                        <>
                          <Icon name="bolt" size={18} /> Create passkey
                        </>
                      }
                    >
                      <span class="spinner" /> Talking to your device…
                    </Show>
                  </button>

                  <Show when={!supported}>
                    <p class="auth-error">
                      This browser does not support passkeys. Try the latest Safari, Chrome, Edge,
                      or Firefox.
                    </p>
                  </Show>
                  <Show when={error()}>
                    <p class="auth-error" role="alert">
                      {error()}
                    </p>
                  </Show>
                  <p class="auth-fineprint">
                    Already collecting?{" "}
                    <button type="button" class="text-link" onClick={() => openAuth("signin")}>
                      Sign in with your passkey
                    </button>
                  </p>
                </form>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
