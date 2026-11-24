import assert from "node:assert/strict";
import {
  address,
  type Address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPair,
  getAddressDecoder,
  getAddressEncoder,
  getAddressFromPublicKey,
  getProgramDerivedAddress,
  getTransactionDecoder,
  lamports,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signBytes,
  signTransaction,
} from "@solana/kit";
import {
  AccountState,
  TOKEN_PROGRAM_ADDRESS,
  getMintEncoder,
  getTokenDecoder,
  getTokenEncoder,
} from "@solana-program/token";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import {
  WIKIGEMS_PROGRAM_PROGRAM_ADDRESS as programAddress,
  getInitializeInstructionAsync,
} from "../worker/chain/generated";
import {
  fromBase64,
  signPreparedMessage,
  toBase64,
} from "../worker/chain/signing";
import {
  CORE_PROGRAM_ADDRESS,
  buildClaimTransaction,
  buildPayoutSetupTransaction,
  buildPurchaseTransaction,
  usdcAta,
} from "../worker/chain/transactions";
import { preparedOperation } from "../worker/chain/operations";
import { splitPrice } from "../shared/amounts";

async function key() {
  const keyPair = await generateKeyPair();
  return { keyPair, address: await getAddressFromPublicKey(keyPair.publicKey) };
}

const [sponsor, mintAuthority, buyer, seller, treasury, deployer, mint] =
  await Promise.all([key(), key(), key(), key(), key(), key(), key()]);
assert(
  sponsor && mintAuthority && buyer && seller && treasury && deployer && mint,
);

const svm = new LiteSVM();
svm.addProgramFromFile(programAddress, "target/deploy/wikigems_program.so");
svm.addProgramFromFile(
  address(CORE_PROGRAM_ADDRESS),
  "programs/wikigems/tests/fixtures/mpl_core.so",
);
const funding = svm.airdrop(sponsor.address, lamports(1_000_000_000n));
assert(funding && !(funding instanceof FailedTransactionMetadata));

const upgradeableLoader = address(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const [programData] = await getProgramDerivedAddress({
  programAddress: upgradeableLoader,
  seeds: [getAddressEncoder().encode(programAddress)],
});
const programDataAccount = svm.getAccount(programData);
assert(programDataAccount.exists);
const programBytes = Uint8Array.from(programDataAccount.data);
programBytes[12] = 1;
programBytes.set(getAddressEncoder().encode(deployer.address), 13);
svm.setAccount({ ...programDataAccount, data: programBytes });

function putTokenAccount(
  accountAddress: ReturnType<typeof address>,
  data: ReturnType<ReturnType<typeof getTokenEncoder>["encode"]>,
) {
  svm.setAccount({
    address: accountAddress,
    data,
    executable: false,
    lamports: lamports(svm.minimumBalanceForRentExemption(BigInt(data.length))),
    programAddress: TOKEN_PROGRAM_ADDRESS,
    space: BigInt(data.length),
  });
}

putTokenAccount(
  mint.address,
  getMintEncoder().encode({
    mintAuthority: mintAuthority.address,
    supply: 5_000_000n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: null,
  }),
);

const [buyerAta, treasuryAta, sellerAta] = await Promise.all([
  usdcAta(buyer.address, mint.address),
  usdcAta(treasury.address, mint.address),
  usdcAta(seller.address, mint.address),
]);
putTokenAccount(
  buyerAta,
  getTokenEncoder().encode({
    mint: mint.address,
    owner: buyer.address,
    amount: 5_000_000n,
    delegate: null,
    state: AccountState.Initialized,
    isNative: null,
    delegatedAmount: 0n,
    closeAuthority: null,
  }),
);

function tokenBalance(ata: Address) {
  const account = svm.getAccount(ata);
  return account.exists ? getTokenDecoder().decode(account.data).amount : 0n;
}

const lifetime = {
  blockhash: svm.latestBlockhash(),
  lastValidBlockHeight: 150n,
};
const make = { sponsor: sponsor.address, lifetime };
const pay = {
  buyer: buyer.address,
  treasury: treasury.address,
  mint: mint.address,
};

async function sendPrepared(
  transaction: ReturnType<typeof compileTransaction>,
  price: bigint,
  server: [typeof sponsor] | [typeof sponsor, typeof mintAuthority],
) {
  const row = preparedOperation({
    ...make,
    id: "integration",
    cardId: "1",
    actorUserId: "buyer",
    priceUsdcMinor: price.toString(),
    sponsorAddress: sponsor.address,
    signerAddress: buyer.address,
    genesisHash: "litesvm",
    now: 1,
    transaction,
  });
  const playerSignature = toBase64(
    await signBytes(buyer.keyPair.privateKey, transaction.messageBytes),
  );
  const { signedTransaction } = await signPreparedMessage(
    row,
    server,
    playerSignature,
    {
      now: 2,
      blockHeight: 0n,
      blockhashValid: true,
    },
  );
  send(getTransactionDecoder().decode(fromBase64(signedTransaction)));
}

function send(tx: Parameters<LiteSVM["sendTransaction"]>[0]) {
  const result = svm.sendTransaction(tx);
  if (result instanceof FailedTransactionMetadata) {
    throw new Error(
      `${JSON.stringify(result.err())}\n${result.meta().logs().join("\n")}`,
    );
  }
}

// Treasury is provisioned during deployment. The seller uses sponsored payout setup.
for (const [owner, ata, id] of [
  [treasury.address, treasuryAta, "treasury-payout"],
  [seller.address, sellerAta, "seller-payout"],
] as const) {
  assert(!svm.getAccount(ata).exists);
  const setup = buildPayoutSetupTransaction({
    ...make,
    owner,
    ata,
    mint: mint.address,
    id,
  });
  assert.deepEqual(Object.keys(setup.signatures), [sponsor.address]);
  send(await signTransaction([sponsor.keyPair], setup));
  assert(svm.getAccount(ata).exists);
}

const { seller: sellerAmount, fee } = splitPrice(1_000_001n, 250);
await sendPrepared(
  await buildPurchaseTransaction({
    ...make,
    ...pay,
    id: "purchase",
    seller: seller.address,
    sellerAmount,
    fee,
  }),
  1_000_001n,
  [sponsor],
);
assert.equal(tokenBalance(buyerAta), 3_999_999n);
assert.equal(tokenBalance(sellerAta), 975_001n);
assert.equal(tokenBalance(treasuryAta), 25_000n);
assert.equal(svm.getBalance(buyer.address) ?? 0n, 0n);

const initialize = await getInitializeInstructionAsync({
  payer: createNoopSigner(sponsor.address),
  usdcMint: mint.address,
  treasury: treasuryAta,
  deployer: createNoopSigner(deployer.address),
  program: programAddress,
  programData,
  admin: deployer.address,
  mintAuthority: mintAuthority.address,
  collectionName: "WikiGems",
  collectionUri: "https://wikigems.example/collection.json",
  feeBps: 250,
});

const initTx = compileTransaction(
  appendTransactionMessageInstructions(
    [initialize],
    setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      setTransactionMessageFeePayer(
        sponsor.address,
        createTransactionMessage({ version: "legacy" }),
      ),
    ),
  ),
);
send(await signTransaction([sponsor.keyPair, deployer.keyPair], initTx));

const claim = await buildClaimTransaction({
  ...make,
  id: "claim",
  mintAuthority: mintAuthority.address,
  programAddress,
  collection: initialize.accounts[2].address,
  destination: seller.address,
  gemId: 512,
  title: "A real LiteSVM claim",
  origin: "https://wikigems.example",
  payment: { ...pay, amount: 250_000n },
});
await sendPrepared(claim.transaction, 250_000n, [sponsor, mintAuthority]);
assert.equal(tokenBalance(buyerAta), 3_749_999n);
assert.equal(tokenBalance(treasuryAta), 275_000n);

const asset = svm.getAccount(claim.assetAddress);
assert(asset.exists);
assert.equal(asset.programAddress, CORE_PROGRAM_ADDRESS);
assert.equal(asset.data[0], 1);
assert.equal(getAddressDecoder().decode(asset.data, 1), seller.address);
assert.equal(svm.getBalance(buyer.address) ?? 0n, 0n);
console.log(
  "LiteSVM executed sponsor-only payout setup, a transfer-only USDC purchase, and a paid Core claim; balances and asset ownership matched.",
);
