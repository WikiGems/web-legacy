import type { VersionedTransaction } from "@solana/web3.js";

export type InjectedProvider = {
  publicKey?: { toString(): string } | null;
  connect: (options?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect: () => Promise<void>;
  signTransaction: (
    transaction: VersionedTransaction,
  ) => Promise<VersionedTransaction>;
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
