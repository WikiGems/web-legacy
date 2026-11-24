import {
  PublicKey,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { WalletError, type InjectedProvider } from "./solana-wallets";

export class BrowserWalletAdapter {
  publicKey: PublicKey | null = null;
  readonly name: string;
  private readonly provider: InjectedProvider;

  constructor(provider: InjectedProvider, name: string) {
    this.provider = provider;
    this.name = name;
  }

  async connect(): Promise<PublicKey> {
    const result = await this.provider.connect();
    const key =
      result && "publicKey" in result
        ? result.publicKey
        : this.provider.publicKey;
    if (!key)
      throw new WalletError(
        "The wallet opened but returned no address.",
        "NO_ADDRESS",
      );
    this.publicKey = new PublicKey(key.toString());
    return this.publicKey;
  }

  async disconnect(): Promise<void> {
    await this.provider.disconnect();
    this.publicKey = null;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.provider.signMessage) {
      throw new WalletError(
        "This wallet cannot sign messages.",
        "NO_SIGN_MESSAGE",
      );
    }
    const result = await this.provider.signMessage(message, "utf8");
    return result instanceof Uint8Array ? result : result.signature;
  }

  async signTransactionMessage(bytes: Uint8Array): Promise<Uint8Array> {
    const message = VersionedMessage.deserialize(bytes);
    const signerIndex = message.staticAccountKeys
      .slice(0, message.header.numRequiredSignatures)
      .findIndex((key) => this.publicKey?.equals(key));
    if (signerIndex < 0)
      throw new WalletError(
        "The connected wallet is not a signer for this transaction.",
      );
    const signed = await this.provider.signTransaction(
      new VersionedTransaction(message),
    );
    const serialized = signed.message.serialize();
    if (
      serialized.length !== bytes.length ||
      !serialized.every((byte, index) => byte === bytes[index])
    )
      throw new WalletError("Your wallet returned a different transaction.");
    const signature = signed.signatures[signerIndex];
    if (signature?.length !== 64 || !signature.some((byte) => byte !== 0))
      throw new WalletError("Your wallet did not sign this transaction.");
    return signature;
  }
}
