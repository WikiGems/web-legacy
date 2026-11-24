export class WalletError extends Error {
  readonly code: string;

  constructor(message: string, code = "WALLET_ERROR") {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}
