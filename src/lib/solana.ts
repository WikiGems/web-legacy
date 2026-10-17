import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore, create } from "@metaplex-foundation/mpl-core";
import { generateSigner } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { Card } from "../../shared/domain";

export const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const SOLANA_CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || "devnet";

export type InjectedProvider = {
  publicKey?: { toString(): string } | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<Uint8Array | { signature: Uint8Array }>;
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
    wallets.push({ id: "phantom", name: "Phantom", provider: window.phantom.solana });
  }
  if (window.solflare) {
    wallets.push({ id: "solflare", name: "Solflare", provider: window.solflare });
  }
  if (window.backpack) {
    wallets.push({ id: "backpack", name: "Backpack", provider: window.backpack });
  }
  return wallets;
}

export class BrowserWalletAdapter {
  publicKey: PublicKey | null = null;
  readonly name: string;
  private readonly provider: InjectedProvider;

  constructor(provider: InjectedProvider, name: string) {
    this.provider = provider;
    this.name = name;
  }

  async connect(): Promise<PublicKey> {
    const result = await this.provider.connect();
    const key = result && "publicKey" in result ? result.publicKey : this.provider.publicKey;
    if (!key) throw new WalletError("The wallet opened but returned no address.", "NO_ADDRESS");
    this.publicKey = new PublicKey(key.toString());
    return this.publicKey;
  }

  async disconnect(): Promise<void> {
    await this.provider.disconnect();
    this.publicKey = null;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    return this.provider.signTransaction(transaction);
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    if (this.provider.signAllTransactions) return this.provider.signAllTransactions(transactions);
    const signed: T[] = [];
    for (const transaction of transactions) signed.push(await this.provider.signTransaction(transaction));
    return signed;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.provider.signMessage) {
      throw new WalletError("This wallet cannot sign messages.", "NO_SIGN_MESSAGE");
    }
    const result = await this.provider.signMessage(message, "utf8");
    return result instanceof Uint8Array ? result : result.signature;
  }
}

export class WalletError extends Error {
  readonly code: string;

  constructor(message: string, code = "WALLET_ERROR") {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

function truncateBytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let output = "";
  for (const character of value) {
    if (encoder.encode(output + character).length > maxBytes) break;
    output += character;
  }
  return output;
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function waitForConfirmation(signature: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        result?: { value?: Array<{ confirmationStatus?: string; err?: unknown } | null> };
      };
      const status = payload.result?.value?.[0];
      if (status?.err) throw new WalletError("The Solana transaction failed on-chain.", "MINT_FAILED");
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new WalletError("The Solana transaction is taking too long to confirm.", "MINT_TIMEOUT");
}

export async function mintCardNft(
  card: Card,
  adapter: BrowserWalletAdapter,
): Promise<{ mintAddress: string; signature: string }> {
  if (!adapter.publicKey) throw new WalletError("Connect a wallet before minting.", "NO_WALLET");

  const umi = createUmi(SOLANA_RPC_URL)
    .use(mplCore())
    .use(walletAdapterIdentity(adapter as never));

  const balance = await umi.rpc.getBalance(umi.identity.publicKey);
  if (balance.basisPoints < 8_000_000n) {
    throw new WalletError(
      "You need a little devnet SOL to pay the mint fee. Open the faucet and request test SOL, then try again.",
      "NO_SOL",
    );
  }

  const asset = generateSigner(umi);
  const name = truncateBytes(`WikiGems: ${card.title}`, 32);
  try {
    const signatureBytes = await create(umi, {
      asset,
      name,
      uri: `${window.location.origin}/api/cards/${card.id}/metadata`,
      owner: umi.identity.publicKey,
    }).send(umi);
    const signature = bs58.encode(signatureBytes);
    await waitForConfirmation(signature);

    return {
      mintAddress: asset.publicKey.toString(),
      signature,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/insufficient|debit|funds|lamport/i.test(message)) {
      throw new WalletError(
        "Your wallet needs more devnet SOL. Request test SOL from the faucet and try again.",
        "NO_SOL",
      );
    }
    if (/reject|denied|cancel/i.test(message)) {
      throw new WalletError("The mint transaction was cancelled in your wallet.", "CANCELLED");
    }
    throw new WalletError(`The mint could not be completed. ${message}`, "MINT_FAILED");
  }
}
