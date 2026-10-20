import { Icon } from "../components/Icon";
import "./Wallet.css";

const examplePublicKey = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";

export default function Wallet() {
  return (
    <main class="wallet-page page-shell">
      <header class="wallet-page-heading">
        <p class="eyebrow">Your wallet · example preview</p>
        <h1>Wallet</h1>
        <p>Your address, balances, and connected accounts in one place.</p>
      </header>

      <aside class="wallet-page-note">
        <Icon name="info" size={19} />
        <p>
          <strong>Example wallet only.</strong> The public key and balances
          below are sample data. All buttons are inactive previews.
        </p>
      </aside>

      <section
        class="wallet-page-panel wallet-address-panel"
        aria-labelledby="wallet-address-title"
      >
        <div class="wallet-panel-heading">
          <span class="wallet-page-icon">
            <Icon name="wallet" size={22} />
          </span>
          <div>
            <p class="eyebrow">Solana</p>
            <h2 id="wallet-address-title">Example public key</h2>
          </div>
        </div>
        <code class="wallet-example-address">{examplePublicKey}</code>
        <span class="wallet-example-label">Sample address</span>
      </section>

      <section class="wallet-balance-grid" aria-label="Example token balances">
        <article class="wallet-page-panel">
          <div class="wallet-token-heading">
            <span class="wallet-token-mark" aria-hidden="true">
              ◎
            </span>
            <div>
              <h2>SOL</h2>
              <p>Solana · example balance</p>
            </div>
          </div>
          <p class="wallet-token-amount">
            2.50 <span>SOL</span>
          </p>
          <span class="wallet-example-label">Example amount</span>
        </article>
        <article class="wallet-page-panel">
          <div class="wallet-token-heading">
            <span class="wallet-token-mark" aria-hidden="true">
              $
            </span>
            <div>
              <h2>USDC</h2>
              <p>USD Coin · example balance</p>
            </div>
          </div>
          <p class="wallet-token-amount">
            125.00 <span>USDC</span>
          </p>
          <span class="wallet-example-label">Example amount</span>
        </article>
      </section>

      <section
        class="wallet-page-panel"
        aria-labelledby="wallet-accounts-title"
      >
        <div class="wallet-panel-heading">
          <Icon name="user" size={21} />
          <h2 id="wallet-accounts-title">Connected accounts</h2>
        </div>
        <p class="wallet-panel-description">
          Account connection options · preview
        </p>
        <div class="wallet-account-row">
          <div>
            <strong>Google</strong>
            <span>Not connected · example status</span>
          </div>
          <button class="btn btn-outline" type="button">
            Connect Google account
          </button>
        </div>
        <div class="wallet-account-row">
          <div>
            <strong>Apple ID</strong>
            <span>Not connected · example status</span>
          </div>
          <button class="btn btn-outline" type="button">
            Connect Apple ID
          </button>
        </div>
      </section>

      <section
        class="wallet-page-panel wallet-export-panel"
        aria-labelledby="wallet-export-title"
      >
        <div>
          <h2 id="wallet-export-title">Private key</h2>
          <p class="wallet-panel-description">Export control preview</p>
        </div>
        <button class="btn btn-outline" type="button">
          Export private key
        </button>
      </section>
    </main>
  );
}
