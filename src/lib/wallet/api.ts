import { Schema } from "effect";
import { WalletChallengeSchema } from "../../../shared/domain";
import {
  WalletVaultStatusSchema,
  type VaultProofPurpose,
  type WalletWrapper,
} from "../../../shared/wallet-vault";
import { WalletError } from "./error";

const root = "/api/wallet";
const vault = `${root}/vault`;

async function request(
  path: string,
  userId: string,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set("x-wikigems-account", userId);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    signal,
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (response.ok) return body;
  const error = typeof body === "object" && body !== null ? body : {};
  throw new WalletError(
    "error" in error && typeof error.error === "string"
      ? error.error
      : "The wallet request failed.",
    "code" in error && typeof error.code === "string" ? error.code : undefined,
  );
}

export const walletVaultApi = {
  async read(userId: string, signal: AbortSignal) {
    const status = Schema.decodeUnknownSync(WalletVaultStatusSchema)(
      await request(vault, userId, signal),
    );
    if (status.userId !== userId)
      throw new WalletError("Your active account changed. Open Wallet again.");
    return status;
  },

  async challenge(
    userId: string,
    publicKey: string,
    purpose: VaultProofPurpose,
    signal: AbortSignal,
  ) {
    return Schema.decodeUnknownSync(WalletChallengeSchema)(
      await request(
        `${root}/challenge?${new URLSearchParams({ wallet: publicKey, purpose })}`,
        userId,
        signal,
      ),
    ).message;
  },

  async create(
    userId: string,
    body: WalletWrapper & {
      signature: string;
      replaceExternalAddress?: string;
    },
    signal: AbortSignal,
  ) {
    await request(vault, userId, signal, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async addWrapper(
    userId: string,
    body: WalletWrapper & { signature: string },
    signal: AbortSignal,
  ) {
    await request(`${vault}/wrappers`, userId, signal, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async removeWrapper(
    userId: string,
    credentialId: string,
    signal: AbortSignal,
  ) {
    await request(
      `${vault}/wrappers/${encodeURIComponent(credentialId)}`,
      userId,
      signal,
      { method: "DELETE" },
    );
  },

  async exported(
    userId: string,
    body: { publicKey: string; signature: string },
    signal: AbortSignal,
  ) {
    await request(`${vault}/exported`, userId, signal, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
