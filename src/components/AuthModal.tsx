import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { authClient } from "../lib/auth-client";
import { requestOnboardingContext, runApi } from "../lib/api";
import { authMode, closeAuth, openAuth, showToast } from "../lib/ui";
import { Icon } from "./Icon";

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
        return "This device already has a passkey for WikiTrade. Sign in instead.";
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
      showToast("Welcome back", { body: "Your desk is ready.", tone: "success" });
      window.location.assign("/desk");
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
      const context = await runApi(requestOnboardingContext(name(), email()));
      const result = await authClient.passkey.addPasskey({
        context: context.context,
        createSession: true,
      });
      if (result?.error) throw new Error(result.error.message || "Could not create the passkey.");
      if (!result?.data) throw new Error("The passkey was not saved. Try again.");

      closeAuth();
      showToast("Desk opened", {
        body: "Your passkey is stored on this device. No password to remember.",
        tone: "success",
      });
      window.location.assign("/desk");
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
            <div class="auth-aside">
              <span class="auth-aside-mark">
                <Icon name="fingerprint" size={34} />
              </span>
              <p class="eyebrow">Identity, not passwords</p>
              <h2>
                One key.
                <br />
                Held by you.
              </h2>
              <p>
                WikiTrade uses a passkey stored in your device’s secure enclave or password manager.
                There is no password to phish, reuse, or leak.
              </p>
              <ul class="auth-points">
                <li>
                  <Icon name="check" size={15} /> Face ID, Touch ID, or security key
                </li>
                <li>
                  <Icon name="check" size={15} /> Phishing-resistant by design
                </li>
                <li>
                  <Icon name="check" size={15} /> Syncs with iCloud, Google, or 1Password
                </li>
              </ul>
              <div class="auth-aside-foot mono">AUTH / WEBAUTHN / TURSO</div>
            </div>

            <div class="auth-main">
              <button class="icon-button auth-close" onClick={closeAuth} aria-label="Close dialog">
                <Icon name="close" />
              </button>

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
                  Create account
                </button>
              </div>

              <Show
                when={isSignup()}
                fallback={
                  <form onSubmit={signIn} class="auth-form">
                    <p class="eyebrow">Welcome back</p>
                    <h3 id="auth-title">Sign in to your desk.</h3>
                    <p class="auth-sub">
                      Your browser will ask for the passkey tied to WikiTrade. No email needed.
                    </p>

                    <button class="btn btn-ink btn-lg auth-submit" type="submit" disabled={busy() !== "idle" || !supported}>
                      <Show when={busy() === "signin"} fallback={<><Icon name="key" size={18} /> Continue with passkey</>}>
                        <span class="spinner" /> Waiting for your device…
                      </Show>
                    </button>

                    <Show when={!supported}>
                      <p class="auth-error">
                        This browser does not support passkeys. Try a current version of Safari, Chrome,
                        Edge, or Firefox.
                      </p>
                    </Show>

                    <Show when={error()}>
                      <p class="auth-error" role="alert">
                        {error()}
                      </p>
                    </Show>

                    <p class="auth-fineprint">
                      No account yet?{" "}
                      <button type="button" class="text-link" onClick={() => openAuth("signup")}>
                        Create one with a passkey
                      </button>
                    </p>
                  </form>
                }
              >
                <form onSubmit={signUp} class="auth-form">
                  <p class="eyebrow">New contributor</p>
                  <h3 id="auth-title">Open your research desk.</h3>
                  <p class="auth-sub">
                    Tell us who to credit. Your passkey is created next — there is no password step.
                  </p>

                  <label class="field">
                    <span>Display name</span>
                    <input
                      ref={nameInput}
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                      placeholder="Mara Chen"
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
                      placeholder="mara@example.com"
                      autocomplete="email"
                      required
                    />
                    <small>Used only to identify your account. We do not send marketing.</small>
                  </label>

                  <button class="btn btn-ink btn-lg auth-submit" type="submit" disabled={busy() !== "idle" || !supported}>
                    <Show when={busy() === "signup"} fallback={<><Icon name="fingerprint" size={18} /> Create passkey</>}>
                      <span class="spinner" /> Talking to your device…
                    </Show>
                  </button>

                  <Show when={!supported}>
                    <p class="auth-error">
                      This browser does not support passkeys. Try a current version of Safari, Chrome,
                      Edge, or Firefox.
                    </p>
                  </Show>

                  <Show when={error()}>
                    <p class="auth-error" role="alert">
                      {error()}
                    </p>
                  </Show>

                  <p class="auth-fineprint">
                    Already have a desk?{" "}
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
