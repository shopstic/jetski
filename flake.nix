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
          # denort = hotPotPkgs.denort;
          vscodeSettings = pkgs.writeTextFile {
            name = "vscode-settings.json";
            text = builtins.toJSON {
              "deno.enable" = true;
              "deno.lint" = true;
              "deno.unstable" = true;
              "deno.path" = hotPotPkgs.deno + "/bin/deno";
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
          runtimeInputs = builtins.attrValues
            {
              inherit (hotPotPkgs) 
                deno
                ;
              inherit (pkgs)
                kubectl
                ;
            };
          denoJson = builtins.fromJSON (builtins.readFile ./deno.json);
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
          jetski-bin = pkgs.writeShellScript "jetski"
            (if denoJson.version == "0.0.0" then ''
              deno run -A --check ${src}/src/app.ts "$@"
            '' else ''
              deno run -A jsr:@wok/jetski@${denoJson.version} "$@"
            '');
          jetski = pkgs.runCommandLocal "jetski"
            {
              buildInputs = [ pkgs.makeWrapper ];
            }
            ''
              makeWrapper ${jetski-bin} $out/bin/jetski \
                --prefix PATH : "${pkgs.lib.makeBinPath runtimeInputs}" \
                --set-default JETSKI_ENABLE_STACKTRACE "0"
            '';
        in
        {
          devShell = pkgs.mkShellNoCC {
            shellHook = ''
              mkdir -p ./.vscode
              cat ${vscodeSettings} > ./.vscode/settings.json
            '';
            buildInputs = runtimeInputs ++ builtins.attrValues {
              inherit (hotPotPkgs)
                typescript-eslint
                ;
              inherit (pkgs)
                powershell
                tmux
                gh
                jq
                ;
            };
          };
          defaultPackage = jetski;
          packages = {
            inherit
              jetski
              ;
          };
        }
      );
}
