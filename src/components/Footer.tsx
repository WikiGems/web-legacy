import { A } from "@solidjs/router";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="page-shell footer-grid">
        <div class="footer-brand">
          <Logo />
          <p>
            The Wikipedia trading card game. Every article is a card. Every card is 1 of 1.
            Collect, duel, and trade the sum of human knowledge.
          </p>
          <div class="footer-sol">
            <Icon name="bolt" size={14} /> Built on Solana · Devnet
          </div>
        </div>
        <div class="footer-col">
          <p class="eyebrow">The game</p>
          <A href="/play">Open packs</A>
          <A href="/play">Your album</A>
          <A href="/play">Duel</A>
          <A href="/play">Trade</A>
        </div>
        <div class="footer-col">
          <p class="eyebrow">The archive</p>
          <a href="https://www.wikipedia.org/" target="_blank" rel="noreferrer">Wikipedia</a>
          <a href="https://www.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia</a>
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          <a href="https://solana.com/" target="_blank" rel="noreferrer">Solana</a>
        </div>
        <div class="footer-col footer-col--meta">
          <p class="eyebrow">Colophon</p>
          <p>SolidJS + Effect + Better Auth.</p>
          <p>Turso for the archive. Cloudflare for the doors.</p>
          <p>Passkeys, not passwords.</p>
        </div>
      </div>
      <div class="page-shell footer-bottom">
        <p>© 2026 WikiGems. A fan-made game. Not affiliated with the Wikimedia Foundation.</p>
        <p class="mono">ONE ARTICLE · ONE CARD · ONE OF ONE</p>
      </div>
    </footer>
  );
}
