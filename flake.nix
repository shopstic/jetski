{
  description = "Local Kubernetes";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    nixpkgs.follows = "hotPot/nixpkgs";
    flakeUtils.follows = "hotPot/flakeUtils";
  };

  outputs = { self, nixpkgs, flakeUtils, hotPot }:
    flakeUtils.lib.eachSystem [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ]
      (system:
        let
          pkgs = import nixpkgs { inherit system; };
          hotPotPkgs = hotPot.packages.${system};
          hotPotLib = hotPot.lib;
          deno = hotPotPkgs.deno_1_42_x;
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
                "editor.suggest.insertMode" = "replace";
                "editor.inlayHints.enabled" = "offUnlessPressed";
              };
              "powershell.powerShellAdditionalExePaths" = {
                "PowerShell Core" = "${pkgs.powershell}/bin/pwsh";
              };
              "nix.enableLanguageServer" = true;
              "nix.formatterPath" = pkgs.nixpkgs-fmt + "/bin/nixpkgs-fmt";
              "nix.serverSettings" = {
                "nil" = {
                  "formatting" = {
                    "command" = [ "nixpkgs-fmt" ];
                  };
                };
              };
              "nix.serverPath" = pkgs.nil + "/bin/nil";
            };
          };
          jetski = pkgs.callPackage hotPotLib.denoAppBuild
            {
              inherit deno;
              inherit (hotPotPkgs) deno-app-build;
              name = "jetski";
              src = builtins.path
                {
                  path = ./.;
                  name = "jetski-src";
                  filter = with pkgs.lib; (path: /* type */_:
                    hasInfix "/src" path ||
                    hasSuffix "/deno.lock" path ||
                    hasSuffix "/deno.json" path
                  );
                };
              appSrcPath = "./src/app.ts";
              denoRunFlags = "-A";
            };
          runtimeInputs = builtins.attrValues
            {
              inherit (pkgs)
                kubectl
                ;
            };
        in
        {
          defaultPackage = pkgs.runCommandLocal "jetski-wrapped"
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
            buildInputs = runtimeInputs ++ builtins.attrValues {
              inherit deno;
              inherit (hotPotPkgs)
                typescript-eslint
                ;
              inherit (pkgs)
                powershell
                tmux
                ;
            };
          };
          packages = {
            inherit jetski;
          };
        }
      );
}
