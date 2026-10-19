{
  description = "WikiGems encrypted development environment (sops-nix)";

  inputs.sops-nix.url = "github:Mic92/sops-nix";

  outputs = { self, sops-nix }: {
    nixosModules.default = {
      imports = [ sops-nix.nixosModules.sops ./nix/secrets.nix ];
    };
    darwinModules.default = {
      imports = [ sops-nix.darwinModules.sops ./nix/secrets.nix ];
    };
  };
}
