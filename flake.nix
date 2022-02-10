{
  description = "Local Kubernetes";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    nixpkgs.follows = "hotPot/nixpkgs";
    flakeUtils.follows = "hotPot/flakeUtils";
  };

  outputs = { self, nixpkgs, flakeUtils, hotPot }:
    flakeUtils.lib.eachSystem [ "aarch64-darwin" "aarch64-linux" "x86_64-darwin" "x86_64-linux" ]
      (system:
        let
          pkgs = import nixpkgs { inherit system; };
          hotPotPkgs = hotPot.packages.${system};
          deno = hotPotPkgs.deno;
          vscodeSettings = pkgs.writeTextFile {
            name = "vscode-settings.json";
            text = builtins.toJSON {
              "deno.enable" = true;
              "deno.lint" = true;
              "deno.unstable" = true;
              "deno.path" = deno + "/bin/deno";
              "deno.suggest.imports.hosts" = {
                "https://deno.land" = false;
              };
              "editor.tabSize" = 2;
              "[typescript]" = {
                "editor.defaultFormatter" = "denoland.vscode-deno";
                "editor.formatOnSave" = true;
              };
              "yaml.schemaStore.enable" = true;
              "yaml.schemas" = {
                "https://json.schemastore.org/github-workflow.json" = ".github/workflows/*.yaml";
              };
              "nix.enableLanguageServer" = true;
              "nix.formatterPath" = pkgs.nixpkgs-fmt + "/bin/nixpkgs-fmt";
              "nix.serverPath" = pkgs.rnix-lsp + "/bin/rnix-lsp";
            };
          };
          jetski = pkgs.callPackage hotPot.lib.denoAppBuild
            {
              inherit deno;
              denoRunFlags = "--unstable -A";
              name = "jetski";
              src = builtins.path
                {
                  path = ./.;
                  name = "jetski-src";
                  filter = with pkgs.lib; (path: /* type */_:
                    hasInfix "/src" path ||
                    hasSuffix "/lock.json" path
                  );
                };
              appSrcPath = "./src/app.ts";
            };
          runtimeInputs = builtins.attrValues
            {
              inherit deno;
              inherit (pkgs)
                kubectl
                ;
            };
        in
        rec {
          defaultPackage = pkgs.runCommandNoCC "jetski-wrapped"
            {
              buildInputs = [ pkgs.makeWrapper ];
            }
            ''
              makeWrapper ${jetski}/bin/jetski $out/bin/jetski \
                --prefix PATH : "${pkgs.lib.makeBinPath runtimeInputs}" \
                --set-default JETSKI_ENABLE_STACKTRACE "0"
            '';
          devShell = pkgs.mkShellNoCC {
            shellHook = ''
              mkdir -p ./.vscode
              cat ${vscodeSettings} > ./.vscode/settings.json
            '';
            buildInputs = runtimeInputs;
          };
          packages = {
            inherit jetski;
          };
        }
      );
}
