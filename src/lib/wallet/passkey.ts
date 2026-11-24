import { decodeBase64Url, encodeBase64Url } from "../../../shared/wallet-vault";
import { WalletError } from "./error";
import { randomBytes } from "./crypto";

type PrfResult = { credentialId: string; output: Uint8Array<ArrayBuffer> };

export type WalletPasskeys = {
  create: (options: {
    rpId: string;
    accountName: string;
    salt: Uint8Array<ArrayBuffer>;
    signal: AbortSignal;
  }) => Promise<{
    credentialId: string;
    output: Uint8Array<ArrayBuffer> | null;
  }>;
  evaluate: (options: {
    rpId: string;
    credentialIds: readonly string[];
    salt: Uint8Array<ArrayBuffer>;
    signal: AbortSignal;
  }) => Promise<PrfResult>;
};

const unsupported = () =>
  new WalletError(
    "This device or passkey provider cannot protect your wallet. Try another passkey or connect an existing wallet.",
    "PRF_UNSUPPORTED",
  );

const credentials = async (prompt: () => Promise<Credential | null>) => {
  if (
    !globalThis.isSecureContext ||
    !globalThis.PublicKeyCredential ||
    !navigator.credentials
  )
    throw unsupported();

  let result: Credential | null;
  try {
    result = await prompt();
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "NotSupportedError" || error.name === "SecurityError")
        throw unsupported();
      if (error.name === "NotAllowedError" || error.name === "AbortError")
        throw new WalletError(
          "The wallet passkey request was cancelled or the passkey was unavailable.",
          "PASSKEY_UNAVAILABLE",
        );
    }
    throw error;
  }
  if (!(result instanceof PublicKeyCredential))
    throw new WalletError(
      "No wallet passkey was selected.",
      "PASSKEY_UNAVAILABLE",
    );
  return result;
};

function readPrf(result: PublicKeyCredential) {
  const output = result.getClientExtensionResults().prf?.results?.first;
  if (output instanceof ArrayBuffer && output.byteLength === 32)
    return new Uint8Array(output);
  if (
    ArrayBuffer.isView(output) &&
    output.buffer instanceof ArrayBuffer &&
    output.byteLength === 32
  )
    return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
  return null;
}

export const browserPasskeys: WalletPasskeys = {
  async create({ rpId, accountName, salt, signal }) {
    const result = await credentials(() =>
      navigator.credentials.create({
        signal,
        publicKey: {
          challenge: randomBytes(32),
          rp: { id: rpId, name: "WikiGems" },
          // A unique handle keeps authenticators from replacing the login or other wallet credentials.
          user: {
            id: randomBytes(32),
            name: `WikiGems wallet · ${accountName}`,
            displayName: "WikiGems wallet",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 60_000,
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    const output = readPrf(result);
    if (result.getClientExtensionResults().prf?.enabled !== true && !output)
      throw unsupported();
    return {
      credentialId: encodeBase64Url(new Uint8Array(result.rawId)),
      output,
    };
  },
  async evaluate({ rpId, credentialIds, salt, signal }) {
    const result = await credentials(() =>
      navigator.credentials.get({
        signal,
        publicKey: {
          challenge: randomBytes(32),
          rpId,
          timeout: 60_000,
          userVerification: "required",
          allowCredentials: credentialIds.map((id) => ({
            type: "public-key",
            id: decodeBase64Url(id),
          })),
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    const output = readPrf(result);
    if (!output) throw unsupported();
    return {
      credentialId: encodeBase64Url(new Uint8Array(result.rawId)),
      output,
    };
  },
};
