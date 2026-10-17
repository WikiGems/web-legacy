import { A, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { openAuth, showToast } from "../lib/ui";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Nav() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = createSignal(false);
  const user = () => session().data?.user;

  async function signOut() {
    await authClient.signOut();
    setMenuOpen(false);
    showToast("Signed out", { body: "Your passkey stays on this device.", tone: "info" });
    navigate("/");
  }

  return (
    <header class="landing-header">
      <nav class="landing-nav page-shell" aria-label="Primary">
        <Logo />
        <div class="landing-links" classList={{ "is-open": menuOpen() }}>
          <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#rarity" onClick={() => setMenuOpen(false)}>Rarity</a>
          <a href="#solana" onClick={() => setMenuOpen(false)}>Solana</a>
          <a href="#trade" onClick={() => setMenuOpen(false)}>Trade</a>
        </div>
        <div class="landing-actions">
          <Show
            when={user()}
            fallback={
              <>
                <button class="btn btn-ghost" onClick={() => openAuth("signin")}>
                  Sign in
                </button>
                <button class="btn btn-primary" onClick={() => openAuth("signup")}>
                  Play free <Icon name="arrow-right" size={15} />
                </button>
              </>
            }
          >
            {(current) => (
              <>
                <A href="/play" class="btn btn-primary">
                  Enter game <Icon name="arrow-right" size={15} />
                </A>
                <button
                  class="avatar-button avatar-button--dark"
                  onClick={signOut}
                  title={`Signed in as ${current().name}. Click to sign out.`}
                  aria-label="Sign out"
                >
                  {avatarInitials(current().name)}
                </button>
              </>
            )}
          </Show>
          <button
            class="icon-button mobile-menu-toggle"
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
