import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const SOLANA_CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || "devnet";

export type InjectedProvider = {
  publicKey?: { toString(): string } | null;
  connect: (options?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ) => Promise<T[]>;
  signMessage?: (
    message: Uint8Array,
    display?: string,
  ) => Promise<Uint8Array | { signature: Uint8Array }>;
};

export type WalletDefinition = {
  id: "phantom" | "solflare" | "backpack";
  name: string;
  provider: InjectedProvider;
};

declare global {
  interface Window {
    phantom?: { solana?: InjectedProvider };
    solflare?: InjectedProvider;
    backpack?: InjectedProvider;
  }
}

export function installedWallets(): WalletDefinition[] {
  if (typeof window === "undefined") return [];
  const wallets: WalletDefinition[] = [];
  if (window.phantom?.solana) {
    wallets.push({
      id: "phantom",
      name: "Phantom",
      provider: window.phantom.solana,
    });
  }
  if (window.solflare) {
    wallets.push({
      id: "solflare",
      name: "Solflare",
      provider: window.solflare,
    });
  }
  if (window.backpack) {
    wallets.push({
      id: "backpack",
      name: "Backpack",
      provider: window.backpack,
    });
  }
  return wallets;
}

export { WalletError } from "./wallet/error";
