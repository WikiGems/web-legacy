import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { authClient } from "../lib/auth-client";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export function Nav() {
  const session = authClient.useSession();
  const user = () => session().data?.user;

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
                <A
                  href="/account"
                  class="avatar-button avatar-button--dark"
                  title={`Account settings for ${current().name}`}
                  aria-label="Account menu"
                >
                  <Avatar name={current().name} image={current().image} />
                </A>
              </>
            )}
          </Show>
        </div>
      </nav>
    </header>
  );
}
