import {
  createSolanaRpc,
  fetchEncodedAccount,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  isAddress,
  signature,
  type Address,
  type Base64EncodedWireTransaction,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  getMintDecoder,
  getTokenDecoder,
} from "@solana-program/token";
import type { ChainOperationTable } from "../db";
import type { Env } from "../env";
import { HttpError } from "../http-error";
import { chainNotConfigured, type ServerSigner } from "./config";
import {
  CONFIG_DISCRIMINATOR,
  findConfigPda,
  getConfigDecoder,
  type Config as ProgramConfig,
} from "./generated";
import { fromBase64, toBase64 } from "./signing";
import { CORE_PROGRAM_ADDRESS, USDC_DECIMALS, usdcAta } from "./transactions";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const clusterGenesis = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  mainnet: MAINNET_GENESIS,
  "mainnet-beta": MAINNET_GENESIS,
};

export function rpcOptions() {
  return { abortSignal: AbortSignal.timeout(6_000) };
}

export function chainUnavailable() {
  return new HttpError(
    503,
    "Solana is temporarily unavailable.",
    "CHAIN_UNAVAILABLE",
  );
}

export async function chainRequest<A>(run: () => Promise<A>): Promise<A> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw chainUnavailable();
  }
}

export async function connectChain(env: Env) {
  return chainRequest(async () => {
    const cluster = env.SOLANA_CLUSTER || "devnet";
    const url = env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const rpc = createSolanaRpc(url);
    const genesisHash = await rpc.getGenesisHash().send(rpcOptions());
    if (!isAddress(genesisHash)) throw chainNotConfigured();
    const expected = Object.entries(clusterGenesis).find(
      ([name]) => name === cluster,
    )?.[1];
    if (
      cluster === "localnet"
        ? !env.SOLANA_RPC_URL ||
          Object.values(clusterGenesis).includes(genesisHash)
        : expected !== genesisHash
    ) {
      throw chainNotConfigured();
    }
    return { rpc, genesisHash };
  });
}

export type Chain = Awaited<ReturnType<typeof connectChain>>;

export function ensureSameChain(chain: Chain, row: ChainOperationTable) {
  if (chain.genesisHash !== row.genesisHash) {
    throw new HttpError(
      503,
      "The original Solana network is unavailable.",
      "CHAIN_MISMATCH",
    );
  }
}

export async function verifyUsdcMint(chain: Chain, mint: Address) {
  const account = await chainRequest(() =>
    fetchEncodedAccount(chain.rpc, mint, {
      commitment: "confirmed",
      ...rpcOptions(),
    }),
  );
  if (
    !account.exists ||
    account.programAddress !== TOKEN_PROGRAM_ADDRESS ||
    account.data.length !== getMintDecoder().fixedSize
  )
    throw chainNotConfigured();
  const { decimals, isInitialized } = getMintDecoder().decode(account.data);
  if (!isInitialized || decimals !== USDC_DECIMALS) throw chainNotConfigured();
}

export async function walletUsdcBalance(
  chain: Chain,
  owner: Address,
  mint: Address,
): Promise<bigint> {
  const ata = await usdcAta(owner, mint);
  const account = await chainRequest(() =>
    fetchEncodedAccount(chain.rpc, ata, {
      commitment: "confirmed",
      ...rpcOptions(),
    }),
  );
  if (!account.exists) return 0n;
  const decoder = getTokenDecoder();
  if (
    account.programAddress !== TOKEN_PROGRAM_ADDRESS ||
    account.data.length !== decoder.fixedSize
  )
    throw chainUnavailable();
  const token = decoder.decode(account.data);
  if (token.owner !== owner || token.mint !== mint) throw chainUnavailable();
  return token.amount;
}

export async function readMintCollection(
  chain: Chain,
  config: {
    mintAuthority: ServerSigner;
    programAddress: Address;
    usdcMint: Address;
    treasury: Address;
  },
) {
  const { programAddress } = config;
  const [configPda] = await findConfigPda({ programAddress });
  const [account, treasuryAta] = await Promise.all([
    chainRequest(() =>
      fetchEncodedAccount(chain.rpc, configPda, {
        commitment: "confirmed",
        ...rpcOptions(),
      }),
    ),
    usdcAta(config.treasury, config.usdcMint),
  ]);
  if (
    !account.exists ||
    account.programAddress !== programAddress ||
    !CONFIG_DISCRIMINATOR.every((byte, index) => account.data[index] === byte)
  ) {
    throw chainNotConfigured();
  }

  let onchain: ProgramConfig;
  try {
    onchain = getConfigDecoder().decode(account.data);
  } catch {
    throw chainNotConfigured();
  }
  if (
    onchain.version !== 1 ||
    onchain.mintAuthority !== config.mintAuthority.address ||
    onchain.usdcMint !== config.usdcMint ||
    onchain.treasury !== treasuryAta
  ) {
    throw chainNotConfigured();
  }
  return onchain.collection;
}

export async function latestBlockhash(chain: Chain) {
  return chainRequest(
    async () =>
      (
        await chain.rpc
          .getLatestBlockhash({ commitment: "confirmed" })
          .send(rpcOptions())
      ).value,
  );
}

export function broadcast(
  chain: Chain,
  transaction: Base64EncodedWireTransaction,
) {
  return chainRequest(() =>
    chain.rpc
      .sendTransaction(transaction, {
        encoding: "base64",
        preflightCommitment: "confirmed",
        maxRetries: 3n,
      })
      .send(rpcOptions()),
  );
}

export async function chainOutcome(
  chain: Chain,
  row: ChainOperationTable,
  finalizedHeight?: bigint,
) {
  ensureSameChain(chain, row);
  if (!row.signedTransaction || !row.txSignature)
    throw new Error("Missing submitted transaction.");
  const txSignature = signature(row.txSignature);
  const height =
    finalizedHeight ??
    (await chainRequest(() =>
      chain.rpc
        .getBlockHeight({
          commitment: "finalized",
        })
        .send(rpcOptions()),
    ));
  const expired = height > BigInt(row.lastValidBlockHeight);
  const {
    value: [status],
  } = await chainRequest(() =>
    chain.rpc
      .getSignatureStatuses([txSignature], { searchTransactionHistory: true })
      .send(rpcOptions()),
  );

  if (
    status?.confirmationStatus === "finalized" ||
    (expired && status === null)
  ) {
    // Read the finalized wire rather than trusting an address appearing in a transaction.
    const finalized = await chainRequest(() =>
      chain.rpc
        .getTransaction(txSignature, {
          commitment: "finalized",
          encoding: "base64",
          maxSupportedTransactionVersion: 0,
        })
        .send(rpcOptions()),
    );
    if (finalized === null) return status === null ? "expired" : "pending";
    if (!finalized.meta || finalized.transaction[0] !== row.signedTransaction)
      throw chainUnavailable();
    const tx = getTransactionDecoder().decode(
      fromBase64(finalized.transaction[0]),
    );
    if (
      toBase64(tx.messageBytes) !== row.message ||
      getSignatureFromTransaction(tx) !== txSignature
    ) {
      throw chainUnavailable();
    }
    return finalized.meta.err === null ? "settled" : "failed";
  }
  return status === null ? "unseen" : "pending";
}

export function storedWire(
  row: ChainOperationTable,
): Base64EncodedWireTransaction {
  if (!row.signedTransaction) throw new Error("Missing submitted transaction.");
  return getBase64EncodedWireTransaction(
    getTransactionDecoder().decode(fromBase64(row.signedTransaction)),
  );
}

export async function coreOwners(chain: Chain, assets: Address[]) {
  const { value } = await chainRequest(() =>
    chain.rpc
      .getMultipleAccounts(assets, {
        commitment: "finalized",
        encoding: "base64",
        dataSlice: { offset: 0, length: 33 },
      })
      .send(rpcOptions()),
  );
  if (value.length !== assets.length) throw chainUnavailable();

  return value.map((account) => {
    if (!account || account.owner !== CORE_PROGRAM_ADDRESS) return null;
    const bytes = fromBase64(account.data[0]);
    // Metaplex Core BaseAssetV1 starts with Key::AssetV1 (1), then the owner.
    return bytes[0] === 1 && bytes.length === 33
      ? getAddressDecoder().decode(bytes, 1)
      : null;
  });
}
