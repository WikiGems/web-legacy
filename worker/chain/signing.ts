import {
  address,
  blockhash,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getSignatureFromTransaction,
  signatureBytes,
  signTransaction,
  verifySignature,
  type Address,
  type Base64EncodedWireTransaction,
  type Blockhash,
  type ReadonlyUint8Array,
  type Transaction,
  type TransactionMessageBytes,
} from "@solana/kit";
import type { ChainOperationTable } from "../db";
import { HttpError } from "../http-error";
import { chainNotConfigured, type ServerSigner } from "./config";

export const toBase64 = (bytes: ReadonlyUint8Array) =>
  getBase64Decoder().decode(bytes);
export const fromBase64 = (value: string) => getBase64Encoder().encode(value);

function decodePrepared(message: string) {
  const bytes = fromBase64(message);
  const decoded = getCompiledTransactionMessageDecoder().decode(bytes);
  return {
    // The message decoder validated the persisted wire format above.
    bytes: bytes as TransactionMessageBytes,
    signers: decoded.staticAccounts.slice(0, decoded.header.numSignerAccounts),
    blockhash: blockhash(decoded.lifetimeToken),
  };
}

export function requiredSigners(message: string): Address[] {
  return [...decodePrepared(message).signers];
}

export function preparedBlockhash(message: string): Blockhash {
  return decodePrepared(message).blockhash;
}

export function preparedExpired(
  row: Pick<ChainOperationTable, "expiresAt" | "lastValidBlockHeight">,
  now: number,
  blockHeight: bigint,
) {
  return now >= row.expiresAt || blockHeight > BigInt(row.lastValidBlockHeight);
}

function invalidSignature() {
  return new HttpError(
    400,
    "That wallet signature is not valid.",
    "BAD_SIGNATURE",
  );
}

async function verifyPlayer(
  signer: Address,
  message: TransactionMessageBytes,
  encoded: string | undefined,
) {
  if (!encoded || !/^[A-Za-z0-9+/]{86}==$/.test(encoded))
    throw invalidSignature();
  const bytes = signatureBytes(fromBase64(encoded));
  if (
    toBase64(bytes) !== encoded ||
    !(await verifySignature(
      await getPublicKeyFromAddress(signer),
      bytes,
      message,
    ))
  ) {
    throw invalidSignature();
  }
  return bytes;
}

export async function signPreparedMessage(
  row: Pick<
    ChainOperationTable,
    | "message"
    | "signerAddress"
    | "sponsorAddress"
    | "expiresAt"
    | "lastValidBlockHeight"
  >,
  serverSigners: ServerSigner[],
  clientSignature: string | undefined,
  lifetime: { now: number; blockHeight: bigint; blockhashValid: boolean },
): Promise<{
  txSignature: string;
  signedTransaction: Base64EncodedWireTransaction;
}> {
  if (
    preparedExpired(row, lifetime.now, lifetime.blockHeight) ||
    !lifetime.blockhashValid
  ) {
    throw new HttpError(
      409,
      "Prepare a new transaction.",
      "TRANSACTION_EXPIRED",
    );
  }

  const { bytes, signers } = decodePrepared(row.message);
  const player = row.signerAddress ? address(row.signerAddress) : null;
  const serverAddresses = new Set(
    serverSigners.map((signer) => signer.address),
  );
  const expected = new Set(serverAddresses);
  if (player) expected.add(player);
  if (
    signers[0] !== row.sponsorAddress ||
    !serverAddresses.has(signers[0]) ||
    (player && serverAddresses.has(player)) ||
    signers.length !== expected.size ||
    !signers.every((signer) => expected.has(signer))
  )
    throw chainNotConfigured();

  const signatures: Transaction["signatures"] = {};
  for (const signer of signers) {
    signatures[signer] =
      signer === player
        ? await verifyPlayer(signer, bytes, clientSignature)
        : null;
  }

  const signed = await signTransaction(
    serverSigners.map((signer) => signer.keyPair),
    {
      messageBytes: bytes,
      signatures,
    },
  );
  return {
    txSignature: getSignatureFromTransaction(signed),
    signedTransaction: getBase64EncodedWireTransaction(signed),
  };
}
