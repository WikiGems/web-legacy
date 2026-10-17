import type { Env } from "./env";

const DEFAULT_RPC = "https://api.devnet.solana.com";

interface RpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T | null> {
  const endpoint = env.SOLANA_RPC_URL || DEFAULT_RPC;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RpcResponse<T>;
    if (payload.error || payload.result === undefined) return null;
    return payload.result;
  } catch {
    return null;
  }
}

interface ParsedTransaction {
  meta?: { err?: unknown } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string }>;
    };
  };
}

export async function verifyMintTransaction(
  env: Env,
  input: { signature: string; mintAddress: string },
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const transaction = await rpc<ParsedTransaction | null>(env, "getTransaction", [
      input.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]);
    if (transaction) {
      if (transaction.meta?.err) return false;
      const accountKeys = (transaction.transaction?.message?.accountKeys ?? []).map((key) =>
        typeof key === "string" ? key : (key.pubkey ?? ""),
      );
      return accountKeys.includes(input.mintAddress);
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return false;
}
