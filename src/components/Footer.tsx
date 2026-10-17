import { A } from "@solidjs/router";
import { Brand } from "./Nav";
import { Icon } from "./Icon";

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="shell footer-grid">
        <div class="footer-brand">
          <Brand />
          <p>
            An open research desk for people who would rather show their work than sell a signal.
          </p>
          <div class="footer-badge">
            <Icon name="fingerprint" size={16} />
            Passkeys, not passwords
          </div>
        </div>
        <div class="footer-col">
          <p class="eyebrow">The desk</p>
          <A href="/#wiki">Research wiki</A>
          <A href="/#pulse">Market pulse</A>
          <A href="/desk">Your desk</A>
        </div>
        <div class="footer-col">
          <p class="eyebrow">The method</p>
          <A href="/#method">How it works</A>
          <A href="/#manifesto">Editorial code</A>
          <A href="/#join">Become a contributor</A>
        </div>
        <div class="footer-col footer-meta">
          <p class="eyebrow">Colophon</p>
          <p>Built with SolidJS, Effect &amp; Bun.</p>
          <p>Auth by Better Auth. Data on Turso.</p>
          <p>Shipped with Cloudflare Workers.</p>
        </div>
      </div>
      <div class="shell footer-bottom">
        <p>© 2026 WikiTrade. Research is not investment advice.</p>
        <p class="mono">WIKI / TRADE · 42.008° N, 87.684° W</p>
      </div>
    </footer>
  );
}
