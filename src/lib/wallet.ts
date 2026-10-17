import { createSignal } from "solid-js";
import {
  BrowserWalletAdapter,
  installedWallets,
  type WalletDefinition,
} from "./solana";

export interface ConnectedWallet {
  address: string;
  name: string;
  adapter: BrowserWalletAdapter;
}

const [wallet, setWallet] = createSignal<ConnectedWallet | null>(null);
const [connecting, setConnecting] = createSignal(false);

export { wallet, connecting };

export function walletOptions(): WalletDefinition[] {
  return installedWallets();
}

export async function connectWallet(id: "phantom" | "solflare" | "backpack"): Promise<ConnectedWallet> {
  const definition = installedWallets().find((candidate) => candidate.id === id);
  if (!definition) {
    throw new Error(
      `${id[0]!.toUpperCase()}${id.slice(1)} is not installed. Install the browser wallet and refresh.`,
    );
  }
  setConnecting(true);
  try {
    const adapter = new BrowserWalletAdapter(definition.provider, definition.name);
    const publicKey = await adapter.connect();
    const connected: ConnectedWallet = {
      address: publicKey.toBase58(),
      name: definition.name,
      adapter,
    };
    setWallet(connected);
    return connected;
  } finally {
    setConnecting(false);
  }
}

export async function disconnectWallet() {
  const current = wallet();
  if (current) {
    try {
      await current.adapter.disconnect();
    } catch {
      // The wallet may already be disconnected.
    }
  }
  setWallet(null);
}
