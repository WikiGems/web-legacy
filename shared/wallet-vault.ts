import { Schema } from "effect";

export const MAX_WALLET_WRAPPERS = 10;

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}

const base64Url = (min: number, max = min) =>
  Schema.String.check(
    Schema.makeFilter((value) => {
      if (value.length > Math.ceil((max * 4) / 3) || !/^[\w-]+$/.test(value))
        return false;
      try {
        const bytes = decodeBase64Url(value);
        return (
          bytes.length >= min &&
          bytes.length <= max &&
          encodeBase64Url(bytes) === value
        );
      } catch {
        return false;
      }
    }),
  );

export const CredentialIdSchema = base64Url(1, 1023);

export const WalletAddressSchema = Schema.String.check(
  Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
);

export const WalletSignatureSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9+/]{85}[AQgw]==$/),
);

export const VaultProofSchema = Schema.Struct({
  publicKey: WalletAddressSchema,
  signature: WalletSignatureSchema,
});

const wrapperFields = {
  version: Schema.Literal(1),
  credentialId: CredentialIdSchema,
  prfSalt: base64Url(32),
  iv: base64Url(12),
  ciphertext: base64Url(48),
  publicKey: WalletAddressSchema,
};

const WalletWrapperSchema = Schema.Struct(wrapperFields);
export type WalletWrapper = typeof WalletWrapperSchema.Type;

export const CreateVaultSchema = Schema.Struct({
  ...wrapperFields,
  signature: WalletSignatureSchema,
  replaceExternalAddress: Schema.optional(WalletAddressSchema),
});
export const AddVaultWrapperSchema = Schema.Struct({
  ...wrapperFields,
  signature: WalletSignatureSchema,
});

export const WalletVaultStatusSchema = Schema.Struct({
  userId: Schema.String,
  rpId: Schema.String,
  walletAddress: Schema.NullOr(WalletAddressSchema),
  vault: Schema.NullOr(
    Schema.Struct({
      publicKey: WalletAddressSchema,
      exportedAt: Schema.NullOr(Schema.Number),
      wrappers: Schema.Array(
        Schema.Struct({ ...wrapperFields, createdAt: Schema.Number }),
      ),
    }),
  ),
});
export type WalletVaultStatus = typeof WalletVaultStatusSchema.Type;

export type VaultProofPurpose =
  | "create"
  | "add-wrapper"
  | "export"
  | "delete-wrapper";
