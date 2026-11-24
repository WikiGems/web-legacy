import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type BlockhashLifetimeConstraint,
  type Instruction,
} from "@solana/kit";
import {
  LEGACY_MEMO_PROGRAM_ADDRESS_V3,
  getAddMemoInstruction,
} from "@solana-program/memo";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { HttpError } from "../http-error";
import { chainNotConfigured } from "./config";
import { findAssetPda, getMintGemInstructionAsync } from "./generated";

export const CORE_PROGRAM_ADDRESS =
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
export const USDC_DECIMALS = 6;
export const METADATA_URI_LIMIT = 96;

export async function usdcAta(owner: Address, mint: Address) {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

export function gemName(title: string) {
  const encoder = new TextEncoder();
  let size = 0;
  let name = "";
  for (const character of `WikiGems: ${title.toWellFormed()}`) {
    size += encoder.encode(character).length;
    if (size > 32) break;
    name += character;
  }
  return name;
}

interface SponsoredMessage {
  sponsor: Address;
  lifetime: BlockhashLifetimeConstraint;
  id: string;
}

function compile(
  { sponsor, lifetime, id }: SponsoredMessage,
  instructions: Instruction[],
) {
  const message = setTransactionMessageLifetimeUsingBlockhash(
    lifetime,
    setTransactionMessageFeePayer(
      sponsor,
      createTransactionMessage({ version: "legacy" }),
    ),
  );
  return compileTransaction(
    appendTransactionMessageInstructions(
      [
        ...instructions,
        getAddMemoInstruction(
          { memo: id },
          { programAddress: LEGACY_MEMO_PROGRAM_ADDRESS_V3 },
        ),
      ],
      message,
    ),
  );
}

async function transfers({
  buyer,
  mint,
  recipients,
}: {
  buyer: Address;
  mint: Address;
  recipients: { wallet: Address; amount: bigint }[];
}): Promise<Instruction[]> {
  const source = await usdcAta(buyer, mint);
  const authority = createNoopSigner(buyer);
  const instructions: Instruction[] = [];

  for (const { wallet, amount } of recipients) {
    if (amount === 0n) continue;
    const destination = await usdcAta(wallet, mint);
    if (source === destination) {
      throw new HttpError(
        409,
        "The payment wallet is also a recipient.",
        "SAME_PAYMENT_WALLET",
      );
    }

    instructions.push(
      getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority,
        amount,
        decimals: USDC_DECIMALS,
      }),
    );
  }
  return instructions;
}

export async function buildPurchaseTransaction(
  input: SponsoredMessage & {
    buyer: Address;
    seller: Address;
    treasury: Address;
    mint: Address;
    sellerAmount: bigint;
    fee: bigint;
  },
) {
  if (input.buyer === input.seller) {
    throw new HttpError(
      409,
      "The buyer and seller share a wallet.",
      "SAME_PAYMENT_WALLET",
    );
  }
  if (input.buyer === input.sponsor) throw chainNotConfigured();

  return compile(
    input,
    await transfers({
      buyer: input.buyer,
      mint: input.mint,
      recipients: [
        { wallet: input.seller, amount: input.sellerAmount },
        { wallet: input.treasury, amount: input.fee },
      ],
    }),
  );
}

export function buildPayoutSetupTransaction(
  input: SponsoredMessage & { owner: Address; ata: Address; mint: Address },
) {
  return compile(input, [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: createNoopSigner(input.sponsor),
      ata: input.ata,
      owner: input.owner,
      mint: input.mint,
    }),
  ]);
}

type ClaimPayment = {
  buyer: Address;
  treasury: Address;
  mint: Address;
  amount: bigint;
};

export async function buildClaimTransaction(
  input: SponsoredMessage & {
    mintAuthority: Address;
    programAddress: Address;
    collection: Address;
    destination: Address;
    gemId: number;
    title: string;
    origin: string;
    payment: ClaimPayment | null;
  },
) {
  const uri = `${input.origin}/g/${input.gemId}`;
  if (new TextEncoder().encode(uri).length > METADATA_URI_LIMIT)
    throw chainNotConfigured();

  const { payment, programAddress } = input;
  if (
    payment &&
    (payment.buyer === input.sponsor || payment.buyer === input.mintAuthority)
  ) {
    throw chainNotConfigured();
  }

  const asset = await findAssetPda({ gemId: input.gemId }, { programAddress });
  const mint = await getMintGemInstructionAsync(
    {
      mintAuthority: createNoopSigner(input.mintAuthority),
      payer: createNoopSigner(input.sponsor),
      collection: input.collection,
      asset,
      owner: input.destination,
      gemId: input.gemId,
      name: gemName(input.title),
      uri,
    },
    { programAddress },
  );
  const instructions = payment
    ? await transfers({
        buyer: payment.buyer,
        mint: payment.mint,
        recipients: [{ wallet: payment.treasury, amount: payment.amount }],
      })
    : [];
  return {
    assetAddress: asset[0],
    transaction: compile(input, [...instructions, mint]),
  };
}
