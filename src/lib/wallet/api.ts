import { Schema } from "effect";
import { WalletChallengeSchema } from "../../../shared/domain";
import {
  WalletVaultStatusSchema,
  encodeBase64,
  type VaultProofPurpose,
  type WalletWrapper,
} from "../../../shared/wallet-vault";
import { createWalletCore } from "./core";
import { browserPasskeys } from "./passkey";
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
    credentialId?: string,
  ) {
    const query = new URLSearchParams({ wallet: publicKey, purpose });
    if (credentialId) query.set("credentialId", credentialId);
    return Schema.decodeUnknownSync(WalletChallengeSchema)(
      await request(`${root}/challenge?${query}`, userId, signal, {
        method: "POST",
      }),
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
  ): Promise<void> {
    // Reuse the wallet's passkey unlock flow for this one proof and discard its signer.
    signal.throwIfAborted();
    const proofWallet = createWalletCore({
      vault: walletVaultApi,
      passkeys: browserPasskeys,
      // The passkey removal control already confirmed this credential.
      confirm: () => true,
    });
    const lock = () => proofWallet.request({ kind: "lock" });
    signal.addEventListener("abort", lock, { once: true });
    try {
      const publicKey = await proofWallet.request({ kind: "unlock", userId });
      const challenge = await walletVaultApi.challenge(
        userId,
        publicKey,
        "delete-wrapper",
        signal,
        credentialId,
      );
      signal.throwIfAborted();
      const signature = encodeBase64(
        await proofWallet.request({
          kind: "sign",
          userId,
          address: publicKey,
          bytes: new TextEncoder().encode(challenge),
          confirmation: "Remove this wallet passkey.",
        }),
      );
      await request(
        `${vault}/wrappers/${encodeURIComponent(credentialId)}`,
        userId,
        signal,
        {
          method: "DELETE",
          body: JSON.stringify({ publicKey, signature }),
        },
      );
    } finally {
      signal.removeEventListener("abort", lock);
      lock();
    }
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
