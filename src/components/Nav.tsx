import { A, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { openAuth, showToast } from "../lib/ui";
import { initials } from "../lib/format";
import { Icon } from "./Icon";

export function Brand(props: { compact?: boolean }) {
  return (
    <A href="/" class="brand" aria-label="WikiTrade home">
      <span class="brand-mark" aria-hidden="true">
        <span class="brand-w">W</span>
        <span class="brand-slash">/</span>
        <span class="brand-t">T</span>
      </span>
      <Show when={!props.compact}>
        <span class="brand-word">WikiTrade</span>
        <span class="brand-beta">BETA</span>
      </Show>
    </A>
  );
}

export function Nav() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = createSignal(false);

  const user = () => {
    const data = session().data;
    return data && "user" in data ? data.user : null;
  };

  async function signOut() {
    await authClient.signOut();
    setMenuOpen(false);
    showToast("Signed out", { body: "Your passkey stays on this device.", tone: "info" });
    navigate("/");
  }

  return (
    <header class="site-header">
      <div class="issue-bar">
        <p>
          <span class="issue-dot" />
          Issue 042 <span class="issue-sep">/</span> The open research desk
        </p>
        <p class="issue-bar-right">
          <span>Passkey-native</span>
          <span class="issue-sep">·</span>
          <span>No passwords, ever</span>
        </p>
      </div>

      <nav class="nav shell" aria-label="Primary">
        <Brand />
        <div class="nav-links" classList={{ "is-open": menuOpen() }}>
          <A href="/#wiki" onClick={() => setMenuOpen(false)}>
            The wiki
          </A>
          <A href="/#pulse" onClick={() => setMenuOpen(false)}>
            Market pulse
          </A>
          <A href="/#method" onClick={() => setMenuOpen(false)}>
            How it works
          </A>
        </div>

        <div class="nav-actions">
          <Show
            when={user()}
            fallback={
              <>
                <button class="btn btn-ghost nav-signin" onClick={() => openAuth("signin")}>
                  Sign in
                </button>
                <button class="btn btn-ink nav-join" onClick={() => openAuth("signup")}>
                  Open your desk <Icon name="arrow-up-right" size={16} />
                </button>
              </>
            }
          >
            {(currentUser) => (
              <div class="nav-user">
                <A href="/desk" class="nav-desk">
                  Your desk
                </A>
                <button
                  class="avatar-button"
                  onClick={signOut}
                  title={`Signed in as ${currentUser().name}. Click to sign out.`}
                  aria-label="Sign out"
                >
                  <span class="avatar">{initials(currentUser().name)}</span>
                </button>
              </div>
            )}
          </Show>
          <button
            class="icon-button nav-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen()}
            aria-label={menuOpen() ? "Close menu" : "Open menu"}
          >
            <Icon name={menuOpen() ? "close" : "menu"} />
          </button>
        </div>
      </nav>
    </header>
  );
}
