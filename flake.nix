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
          hotPotLib = hotPot.lib.${system};
          deno = hotPotPkgs.deno;
          # denort = hotPotPkgs.denort;
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
          runtimeInputs = builtins.attrValues
            {
              inherit (pkgs)
                kubectl
                ;
            };
          jetski =
            let
              name = "jetski";
              src = builtins.path
                {
                  path = ./.;
                  name = "${name}-src";
                  filter = with pkgs.lib; (path: /* type */_:
                    hasInfix "/src" path ||
                    hasSuffix "/deno.lock" path ||
                    hasSuffix "/deno.json" path
                  );
                };
              deno-cache-dir = pkgs.callPackage hotPotLib.denoAppCache2 {
                inherit deno name src;
                config-file = ./deno.json;
                lock-file = ./deno.lock;
              };
              transpiled = pkgs.callPackage hotPotLib.denoAppTranspile
                {
                  inherit name deno-cache-dir src;
                  appSrcPath = "./src/app.ts";
                  denoRunFlags = ''"''${DENO_RUN_FLAGS[@]}"'';
                  preExec = ''
                    DENO_RUN_FLAGS=("-A")
                    if [ ! -f deno.lock ]; then
                      DENO_RUN_FLAGS+=("--no-lock")
                    fi
                    if [ -f deno.json ]; then
                      DENO_RUN_FLAGS+=("--config=deno.json")
                    elif [ -f deno.jsonc ]; then
                      DENO_RUN_FLAGS+=("--config=deno.jsonc")
                    fi
                  '';
                  allowNpmSpecifiers = true;
                };
              denoJson = builtins.fromJSON (builtins.readFile ./deno.json);
            in
            pkgs.runCommandLocal "${name}-wrapped"
              {
                buildInputs = [ pkgs.makeWrapper ];
              }
              ''
                makeWrapper ${transpiled}/bin/jetski $out/bin/jetski \
                  --set JETSKI_VERSION "${denoJson.version}" \
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
              inherit deno;
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
