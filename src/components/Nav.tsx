import { A, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { showToast } from "../lib/ui";
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
  const user = () => session().data?.user;

  async function signOut() {
    await authClient.signOut();
    showToast("Signed out", {
      body: "Your passkey stays on this device.",
      tone: "info",
    });
    navigate("/");
  }

  return (
    <header class="landing-header">
      <nav class="landing-nav app-nav page-shell" aria-label="Primary">
        <Logo />
        <div class="app-nav-tabs">
          <A href="/play" end activeClass="is-current">
            Play
          </A>
          <A href="/trade" end activeClass="is-current">
            Trade
          </A>
          <A href="/buy" end activeClass="is-current">
            Buy
          </A>
          <A href="/sell" end activeClass="is-current">
            Sell
          </A>
          <A href="/action" end activeClass="is-current">
            Action
          </A>
          <A href="/collection" end activeClass="is-current">
            My collection
          </A>
          <A href="/wallet" end activeClass="is-current">
            Wallet
          </A>
        </div>
        <div class="landing-actions">
          <Show
            when={user()}
            fallback={
              <>
                <A href="/login" class="btn btn-ghost">
                  Sign in
                </A>
                <A href="/login?mode=signup" class="btn btn-primary">
                  Play free <Icon name="arrow-right" size={15} />
                </A>
              </>
            }
          >
            {(current) => (
              <>
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
        </div>
      </nav>
    </header>
  );
}
