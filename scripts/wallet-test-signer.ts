// Served only by the account e2e harness. Uses the same wallet client as the app.
import { createWalletCore } from "../src/lib/wallet/core";
import { browserPasskeys } from "../src/lib/wallet/passkey";
import { walletVaultApi } from "../src/lib/wallet/api";

export async function signWithWallet(userId: string, bytes: number[]) {
  const core = createWalletCore({
    vault: walletVaultApi,
    passkeys: browserPasskeys,
    confirm: (message) => window.confirm(message),
  });
  try {
    const address = await core.request({ kind: "unlock", userId });
    const signature = await core.request({
      kind: "sign",
      userId,
      address,
      bytes: Uint8Array.from(bytes),
      confirmation: "Claim the test card",
    });
    return { address, signature: [...signature] };
  } finally {
    core.request({ kind: "lock" });
  }
}
