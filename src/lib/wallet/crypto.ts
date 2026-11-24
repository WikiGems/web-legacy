import bs58 from "bs58";
import {
  decodeBase64Url,
  encodeBase64Url,
  type WalletWrapper,
} from "../../../shared/wallet-vault";

type Bytes = Uint8Array<ArrayBuffer>;
type WrapContext = Pick<
  WalletWrapper,
  "version" | "credentialId" | "publicKey" | "prfSalt"
> & {
  userId: string;
};

type WalletSigner = {
  signMessage: (message: Uint8Array) => Promise<Bytes>;
  destroy: () => void;
};

const encode = (text: string) => new TextEncoder().encode(text);
const keyCheck = encode("WikiGems local wallet key check v1");
// RFC 8410 PrivateKeyInfo for Ed25519. The 32-byte seed follows the prefix.
const pkcs8Prefix = Uint8Array.of(
  0x30,
  0x2e,
  0x02,
  0x01,
  0x00,
  0x30,
  0x05,
  0x06,
  0x03,
  0x2b,
  0x65,
  0x70,
  0x04,
  0x22,
  0x04,
  0x20,
);

function nativeUnavailable(error: unknown) {
  return error instanceof DOMException && error.name === "NotSupportedError";
}

export const randomBytes = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));

function wrapParameters(context: WrapContext) {
  return {
    salt: decodeBase64Url(context.prfSalt),
    info: encode(
      JSON.stringify([
        "wikigems.wallet.seed",
        context.version,
        context.userId,
        context.credentialId,
      ]),
    ),
    additionalData: Uint8Array.from(bs58.decode(context.publicKey)),
  };
}

async function deriveWrapKey(
  prf: Bytes,
  { salt, info }: ReturnType<typeof wrapParameters>,
) {
  const material = await crypto.subtle.importKey("raw", prf, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapSeed(
  seed: Bytes,
  prf: Bytes,
  context: WrapContext,
): Promise<WalletWrapper> {
  const parameters = wrapParameters(context);
  const key = await deriveWrapKey(prf, parameters);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: parameters.additionalData },
    key,
    seed,
  );
  return {
    version: context.version,
    credentialId: context.credentialId,
    prfSalt: context.prfSalt,
    publicKey: context.publicKey,
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function unwrapSeed(
  wrapper: WalletWrapper,
  prf: Bytes,
  userId: string,
): Promise<Bytes> {
  const parameters = wrapParameters({ ...wrapper, userId });
  const key = await deriveWrapKey(prf, parameters);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64Url(wrapper.iv),
        additionalData: parameters.additionalData,
      },
      key,
      decodeBase64Url(wrapper.ciphertext),
    ),
  );
}

export async function generateWallet(): Promise<{
  seed: Bytes;
  publicKey: string;
}> {
  let keypair: CryptoKeyPair;
  try {
    keypair = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]);
  } catch (error) {
    if (!nativeUnavailable(error)) throw error;
    const { ed25519 } = await import("@noble/curves/ed25519.js");
    const seed = randomBytes(32);
    return { seed, publicKey: bs58.encode(ed25519.getPublicKey(seed)) };
  }

  const address = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );
  const privateKey = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keypair.privateKey),
  );
  try {
    if (
      privateKey.length !== pkcs8Prefix.length + 32 ||
      !pkcs8Prefix.every((byte, i) => privateKey[i] === byte)
    )
      throw new Error(
        "This browser exported an unrecognized wallet key format.",
      );
    return {
      seed: privateKey.slice(pkcs8Prefix.length),
      publicKey: bs58.encode(address),
    };
  } finally {
    privateKey.fill(0);
  }
}

async function importSigner(
  seed: Bytes,
  address: Bytes,
): Promise<WalletSigner> {
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(seed, pkcs8Prefix.length);
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      "Ed25519",
      false,
      ["sign"],
    );
    const publicKey = await crypto.subtle.importKey(
      "raw",
      address,
      "Ed25519",
      false,
      ["verify"],
    );
    const proof = await crypto.subtle.sign("Ed25519", key, keyCheck);
    if (!(await crypto.subtle.verify("Ed25519", publicKey, proof, keyCheck)))
      throw new Error("The saved key does not match this wallet.");

    return {
      signMessage: async (message) =>
        new Uint8Array(
          await crypto.subtle.sign("Ed25519", key, Uint8Array.from(message)),
        ),
      destroy: () => {},
    };
  } catch (error) {
    if (!nativeUnavailable(error)) throw error;
    const { ed25519 } = await import("@noble/curves/ed25519.js");
    if (
      !ed25519
        .getPublicKey(seed)
        .every((byte, index) => byte === address[index])
    )
      throw new Error("The saved key does not match this wallet.");
    let privateSeed: Bytes | undefined = seed.slice();
    return {
      signMessage: async (message) => {
        if (!privateSeed) throw new Error("The wallet is locked.");
        return ed25519.sign(message, privateSeed);
      },
      destroy: () => {
        privateSeed?.fill(0);
        privateSeed = undefined;
      },
    };
  } finally {
    pkcs8.fill(0);
  }
}

export function importWalletSigner(seed: Bytes, publicKey: string) {
  return importSigner(seed, Uint8Array.from(bs58.decode(publicKey)));
}

export function exportSecretKey(seed: Bytes, publicKey: string) {
  const secret = new Uint8Array(64);
  try {
    secret.set(seed);
    secret.set(bs58.decode(publicKey), 32);
    return bs58.encode(secret);
  } finally {
    secret.fill(0);
  }
}
