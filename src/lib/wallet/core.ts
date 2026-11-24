import {
  decodeBase64Url,
  encodeBase64,
  encodeBase64Url,
  MAX_WALLET_WRAPPERS,
  type VaultProofPurpose,
  type WalletVaultStatus,
  type WalletWrapper,
} from "../../../shared/wallet-vault";
import { WalletError } from "./error";
import type { walletVaultApi } from "./api";
import {
  exportSecretKey,
  generateWallet,
  importWalletSigner,
  randomBytes,
  unwrapSeed,
  wrapSeed,
} from "./crypto";
import type { WalletPasskeys } from "./passkey";

type Account = { userId: string; accountName: string };
type Signer = Awaited<ReturnType<typeof importWalletSigner>>;

type Commands = {
  create: {
    input: Account & { replaceExternalAddress?: string };
    output: string;
  };
  unlock: { input: { userId: string }; output: string };
  sign: {
    input: {
      userId: string;
      address: string;
      bytes: Uint8Array;
      confirmation: string;
    };
    output: Uint8Array;
  };
  export: { input: { userId: string }; output: string };
  "confirm-export": { input: { userId: string }; output: void };
  "add-wrapper": { input: Account; output: void };
  "remove-wrapper": {
    input: { userId: string; credentialId: string };
    output: void;
  };
};

type WalletMessage = {
  [K in keyof Commands]: { kind: K } & Commands[K]["input"];
}[keyof Commands];

type CoreOptions = {
  vault: typeof walletVaultApi;
  passkeys: WalletPasskeys;
  confirm: (text: string) => boolean;
};

function savedWallet(status: WalletVaultStatus) {
  const { vault } = status;
  const first = vault?.wrappers[0];
  if (!vault || !first)
    throw new WalletError(
      "No wallet passkey is available. Connect your existing wallet if you exported it.",
    );
  if (vault.publicKey !== status.walletAddress)
    throw new WalletError(
      "Your saved wallet does not match the linked address.",
    );
  return { ...vault, prfSalt: first.prfSalt };
}

export function createWalletCore({ vault, passkeys, confirm }: CoreOptions) {
  let unlocked: { userId: string; address: string; signer: Signer } | undefined;
  let pending: AbortController | undefined;
  let exportProof:
    | { userId: string; publicKey: string; signature: string }
    | undefined;

  function lock() {
    pending?.abort(new WalletError("The wallet is locked.", "WALLET_LOCKED"));
    unlocked?.signer.destroy();
    unlocked = undefined;
    exportProof = undefined;
  }

  async function run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (pending)
      throw new WalletError(
        "Finish the current wallet request first.",
        "WALLET_BUSY",
      );
    const controller = new AbortController();
    pending = controller;
    try {
      const result = await operation(controller.signal);
      controller.signal.throwIfAborted();
      return result;
    } finally {
      pending = undefined;
    }
  }

  function activate(userId: string, address: string, signer: Signer) {
    unlocked?.signer.destroy();
    unlocked = { userId, address, signer };
    return address;
  }

  async function withOpenedSeed<T>(
    status: WalletVaultStatus,
    signal: AbortSignal,
    use: (opened: {
      seed: Uint8Array<ArrayBuffer>;
      wrapper: WalletWrapper;
    }) => Promise<T>,
  ) {
    const saved = savedWallet(status);
    const result = await passkeys.evaluate({
      rpId: status.rpId,
      credentialIds: saved.wrappers.map((wrapper) => wrapper.credentialId),
      salt: decodeBase64Url(saved.prfSalt),
      signal,
    });
    const wrapper = saved.wrappers.find(
      (candidate) => candidate.credentialId === result.credentialId,
    );
    let seed: Uint8Array<ArrayBuffer>;
    try {
      signal.throwIfAborted();
      if (!wrapper)
        throw new WalletError("That passkey is not saved for this wallet.");
      seed = await unwrapSeed(wrapper, result.output, status.userId).catch(
        () => {
          throw new WalletError(
            "This passkey could not unlock the wallet. Try another saved passkey.",
          );
        },
      );
    } finally {
      result.output.fill(0);
    }
    try {
      signal.throwIfAborted();
      return await use({ seed, wrapper });
    } finally {
      seed.fill(0);
    }
  }

  async function protectSeed(
    {
      seed,
      userId,
      accountName,
      rpId,
      publicKey,
      prfSalt,
    }: Account & {
      seed: Uint8Array<ArrayBuffer>;
      rpId: string;
      publicKey: string;
      prfSalt: string;
    },
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const salt = decodeBase64Url(prfSalt);
    const registered = await passkeys.create({
      rpId,
      accountName,
      salt,
      signal,
    });
    const { credentialId } = registered;
    const evaluate = async () => {
      signal.throwIfAborted();
      const result = await passkeys.evaluate({
        rpId,
        credentialIds: [credentialId],
        salt,
        signal,
      });
      if (result.credentialId !== credentialId) {
        result.output.fill(0);
        throw new WalletError(
          "The wallet passkey did not match the one just created.",
        );
      }
      return result.output;
    };

    const prf = registered.output ?? (await evaluate());
    let wrapper: WalletWrapper;
    try {
      signal.throwIfAborted();
      wrapper = await wrapSeed(seed, prf, {
        version: 1,
        userId,
        credentialId,
        prfSalt,
        publicKey,
      });
    } finally {
      prf.fill(0);
    }

    // Verify that a fresh assertion can recover and use the expected signing key.
    const check = await evaluate();
    let unwrapped: Uint8Array<ArrayBuffer>;
    try {
      unwrapped = await unwrapSeed(wrapper, check, userId);
    } catch {
      throw new WalletError(
        "This passkey could not reopen your wallet. Try a different passkey provider or connect an existing wallet.",
        "PRF_UNSUPPORTED",
      );
    } finally {
      check.fill(0);
    }
    try {
      signal.throwIfAborted();
      const signer = await importWalletSigner(unwrapped, publicKey);
      return { wrapper, signer };
    } finally {
      unwrapped.fill(0);
    }
  }

  async function proof(
    userId: string,
    publicKey: string,
    signer: Signer,
    purpose: VaultProofPurpose,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const message = await vault.challenge(userId, publicKey, purpose, signal);
    signal.throwIfAborted();
    return encodeBase64(
      await signer.signMessage(new TextEncoder().encode(message)),
    );
  }

  async function create(
    message: Extract<WalletMessage, { kind: "create" }>,
    signal: AbortSignal,
  ) {
    const { userId, replaceExternalAddress } = message;
    const status = await vault.read(userId, signal);
    if (status.vault)
      throw new WalletError(
        "You already have a saved wallet. Unlock it to continue.",
      );
    if (status.walletAddress && status.walletAddress !== replaceExternalAddress)
      throw new WalletError(
        "Confirm that you want to replace your linked wallet.",
        "REPLACE_EXTERNAL",
      );

    const generated = await generateWallet();
    const { publicKey } = generated;
    const { wrapper, signer } = await protectSeed(
      {
        ...message,
        ...generated,
        rpId: status.rpId,
        prfSalt: encodeBase64Url(randomBytes(32)),
      },
      signal,
    ).finally(() => {
      generated.seed.fill(0);
    });
    try {
      const signature = await proof(
        userId,
        publicKey,
        signer,
        "create",
        signal,
      );
      await vault.create(
        userId,
        { ...wrapper, signature, replaceExternalAddress },
        signal,
      );
      signal.throwIfAborted();
      return activate(userId, publicKey, signer);
    } catch (error) {
      signer.destroy();
      throw error;
    }
  }

  async function dispatch(message: WalletMessage, signal: AbortSignal) {
    const { userId } = message;
    switch (message.kind) {
      case "create":
        return create(message, signal);
      case "unlock":
        return withOpenedSeed(
          await vault.read(userId, signal),
          signal,
          async ({ seed, wrapper }) => {
            const signer = await importWalletSigner(seed, wrapper.publicKey);
            if (signal.aborted) signer.destroy();
            signal.throwIfAborted();
            return activate(userId, wrapper.publicKey, signer);
          },
        );
      case "sign": {
        if (
          !unlocked ||
          unlocked.userId !== userId ||
          unlocked.address !== message.address
        )
          throw new WalletError(
            "Unlock your wallet to continue.",
            "WALLET_LOCKED",
          );
        const { signer } = unlocked;
        const bytes = Uint8Array.from(message.bytes);
        if (!message.confirmation.trim())
          throw new WalletError(
            "A description of the wallet action is required.",
          );
        if (!confirm(message.confirmation))
          throw new WalletError(
            "The wallet request was cancelled.",
            "CANCELLED",
          );
        signal.throwIfAborted();
        return signer.signMessage(bytes);
      }
      case "export":
        exportProof = undefined;
        return withOpenedSeed(
          await vault.read(userId, signal),
          signal,
          async ({ seed, wrapper }) => {
            const { publicKey } = wrapper;
            const signer = await importWalletSigner(seed, publicKey);
            try {
              const signature = await proof(
                userId,
                publicKey,
                signer,
                "export",
                signal,
              );
              signal.throwIfAborted();
              const secretKey = exportSecretKey(seed, publicKey);
              exportProof = { userId, publicKey, signature };
              return secretKey;
            } finally {
              signer.destroy();
            }
          },
        );
      case "confirm-export":
        if (!exportProof || exportProof.userId !== userId)
          throw new WalletError(
            "Open the private key again to confirm your copy.",
          );
        await vault.exported(
          userId,
          {
            publicKey: exportProof.publicKey,
            signature: exportProof.signature,
          },
          signal,
        );
        exportProof = undefined;
        return;
      case "add-wrapper": {
        const status = await vault.read(userId, signal);
        const saved = savedWallet(status);
        if (saved.wrappers.length >= MAX_WALLET_WRAPPERS)
          throw new WalletError(
            "Remove a wallet passkey before adding another.",
          );
        return withOpenedSeed(status, signal, async ({ seed }) => {
          const { wrapper, signer } = await protectSeed(
            {
              ...message,
              seed,
              publicKey: saved.publicKey,
              prfSalt: saved.prfSalt,
              rpId: status.rpId,
            },
            signal,
          );
          try {
            const signature = await proof(
              userId,
              wrapper.publicKey,
              signer,
              "add-wrapper",
              signal,
            );
            await vault.addWrapper(userId, { ...wrapper, signature }, signal);
          } finally {
            signer.destroy();
          }
        });
      }
      case "remove-wrapper":
        return vault.removeWrapper(userId, message.credentialId, signal);
    }
  }

  function request<K extends keyof Commands>(
    message: WalletMessage & { kind: K },
  ): Promise<Commands[K]["output"]>;
  function request(message: { kind: "lock" }): void;
  function request(message: WalletMessage | { kind: "lock" }) {
    if (message.kind === "lock") return lock();
    return run((signal) => dispatch(message, signal));
  }

  return { request };
}
