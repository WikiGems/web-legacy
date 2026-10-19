# The importing host supplies sops.age.keyFile and the secret owner.
# Only ciphertext enters the Nix store. Decryption happens at activation time.
{ ... }: {
  sops.secrets."wikigems.env" = {
    sopsFile = ../secrets/development.env;
    format = "dotenv";
    key = "";
    mode = "0400";
  };
}
