import { createStore } from "./store";
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

export const walletStore = createStore<{
  wallet: ConnectedWallet | null;
  connecting: boolean;
}>({ wallet: null, connecting: false });
export const useWallet = walletStore.useSnapshot;

export function walletOptions(): WalletDefinition[] {
  return installedWallets();
}

export async function connectWallet(
  id: "phantom" | "solflare" | "backpack",
): Promise<ConnectedWallet> {
  const definition = installedWallets().find(
    (candidate) => candidate.id === id,
  );
  if (!definition) {
    throw new Error(
      `${id[0]!.toUpperCase()}${id.slice(1)} is not installed. Install the browser wallet and refresh.`,
    );
  }
  walletStore.set((state) => ({ ...state, connecting: true }));
  try {
    const adapter = new BrowserWalletAdapter(
      definition.provider,
      definition.name,
    );
    const publicKey = await adapter.connect();
    const connected: ConnectedWallet = {
      address: publicKey.toBase58(),
      name: definition.name,
      adapter,
    };
    walletStore.set((state) => ({ ...state, wallet: connected }));
    return connected;
  } finally {
    walletStore.set((state) => ({ ...state, connecting: false }));
  }
}

export async function disconnectWallet() {
  const current = walletStore.getSnapshot().wallet;
  if (current) {
    try {
      await current.adapter.disconnect();
    } catch {
      // The wallet may already be disconnected.
    }
  }
  walletStore.set((state) => ({ ...state, wallet: null }));
}
