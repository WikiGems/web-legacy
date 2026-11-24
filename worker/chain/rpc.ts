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
  AccountState,
  TOKEN_PROGRAM_ADDRESS,
  getMintDecoder,
  getTokenDecoder,
} from "@solana-program/token";
import type { ChainOperationTable } from "../db";
import type { Env } from "../env";
import { HttpError } from "../http-error";
import {
  chainNotConfigured,
  sponsorBalanceFloor,
  type ServerSigner,
} from "./config";
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
    return { rpc, genesisHash, url };
  });
}

export type Chain = Awaited<ReturnType<typeof connectChain>>;

export function ensureSameChain(
  chain: Chain,
  row: Pick<ChainOperationTable, "genesisHash">,
) {
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

type MarketAccounts = {
  programAddress: Address;
  usdcMint: Address;
  treasury: Address;
};

const CONFIG_TTL_MS = 60_000;
const configCache = new Map<
  string,
  { value: ProgramConfig; expiresAt: number }
>();

export async function verifyMarketAccounts(
  chain: Chain,
  config: MarketAccounts,
) {
  const { programAddress, usdcMint, treasury } = config;
  const key = JSON.stringify([
    chain.url,
    chain.genesisHash,
    programAddress,
    usdcMint,
    treasury,
  ]);
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const expiresAt = Date.now() + CONFIG_TTL_MS;
  const [configPda] = await findConfigPda({ programAddress });
  const [account, treasuryAta] = await Promise.all([
    chainRequest(() =>
      fetchEncodedAccount(chain.rpc, configPda, {
        commitment: "finalized",
        ...rpcOptions(),
      }),
    ),
    usdcAta(treasury, usdcMint),
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
    onchain.usdcMint !== usdcMint ||
    onchain.treasury !== treasuryAta
  )
    throw chainNotConfigured();
  configCache.set(key, { value: onchain, expiresAt });
  return onchain;
}

export async function readMintCollection(
  chain: Chain,
  config: MarketAccounts & { mintAuthority: ServerSigner },
) {
  const onchain = await verifyMarketAccounts(chain, config);
  if (onchain.mintAuthority !== config.mintAuthority.address)
    throw chainNotConfigured();
  return onchain.collection;
}

export async function payoutAta(chain: Chain, owner: Address, mint: Address) {
  const ata = await usdcAta(owner, mint);
  const account = await chainRequest(() =>
    fetchEncodedAccount(chain.rpc, ata, {
      commitment: "finalized",
      ...rpcOptions(),
    }),
  );
  if (!account.exists) return { ata, exists: false };
  const decoder = getTokenDecoder();
  if (
    account.programAddress !== TOKEN_PROGRAM_ADDRESS ||
    account.data.length !== decoder.fixedSize
  )
    throw chainNotConfigured();
  const token = decoder.decode(account.data);
  return {
    ata,
    exists:
      token.owner === owner &&
      token.mint === mint &&
      token.state === AccountState.Initialized,
  };
}

export async function requirePayoutAccounts(
  chain: Chain,
  config: { usdcMint: Address; treasury: Address },
  seller?: Address,
) {
  const [treasury, proceeds] = await Promise.all([
    payoutAta(chain, config.treasury, config.usdcMint),
    seller ? payoutAta(chain, seller, config.usdcMint) : undefined,
  ]);
  if (!treasury.exists)
    throw new HttpError(
      503,
      "The treasury payout account is unavailable.",
      "TREASURY_PAYOUT_REQUIRED",
    );
  if (proceeds && !proceeds.exists)
    throw new HttpError(
      409,
      "The seller needs an active USDC payout account.",
      "SELLER_PAYOUT_REQUIRED",
    );
}

const balanceCache = new Map<string, { value: bigint; expiresAt: number }>();

export async function requireSponsorBalance(
  chain: Chain,
  env: Env,
  sponsor: Address,
) {
  const floor = sponsorBalanceFloor(env);
  const key = JSON.stringify([chain.url, chain.genesisHash, sponsor]);
  let balance = balanceCache.get(key);
  if (!balance || balance.expiresAt <= Date.now()) {
    const expiresAt = Date.now() + 60_000;
    try {
      const { value } = await chain.rpc
        .getBalance(sponsor, { commitment: "confirmed" })
        .send(rpcOptions());
      balance = { value, expiresAt };
      balanceCache.set(key, balance);
    } catch {
      console.error("Sponsor balance check failed", {
        sponsor,
        genesisHash: chain.genesisHash,
      });
      throw sponsorUnavailable();
    }
  }
  if (balance.value < floor) {
    console.error("Sponsor balance below floor", {
      sponsor,
      genesisHash: chain.genesisHash,
      balance: balance.value.toString(),
      floor: floor.toString(),
    });
    throw sponsorUnavailable();
  }
}

function sponsorUnavailable() {
  return new HttpError(
    503,
    "Sponsored transactions are temporarily unavailable.",
    "SPONSOR_UNAVAILABLE",
  );
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
  row: Pick<
    ChainOperationTable,
    | "genesisHash"
    | "signedTransaction"
    | "txSignature"
    | "lastValidBlockHeight"
    | "message"
  >,
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
  const pastLifetime = height > BigInt(row.lastValidBlockHeight);
  const pastSafetyMargin = height > BigInt(row.lastValidBlockHeight) + 32n;
  const {
    value: [status],
  } = await chainRequest(() =>
    chain.rpc
      .getSignatureStatuses([txSignature], { searchTransactionHistory: true })
      .send(rpcOptions()),
  );

  if (
    status?.confirmationStatus === "finalized" ||
    (pastLifetime && status === null)
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
    if (finalized === null) {
      if (status !== null) return "pending";
      return pastSafetyMargin ? "not_found" : "unseen_past_lifetime";
    }
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
  row: Pick<ChainOperationTable, "signedTransaction">,
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
