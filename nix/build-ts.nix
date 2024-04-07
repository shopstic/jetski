{ name
, src
, stdenv
, deno
, writeShellScriptBin
}:
let
  build = stdenv.mkDerivation
    {
      inherit src;
      name = "${name}-build";
      nativeBuildInputs = [ deno ];
      __noChroot = true;
      phases = [ "unpackPhase" "installPhase" ];
      installPhase =
        ''
          mkdir -p $out/vendor
          export DENO_DIR=$(mktemp -d)
          deno vendor --output $out/vendor ./src/app.ts
          cp -R ./src $out/src
        '';
    };
in
writeShellScriptBin name ''
  exec ${deno}/bin/deno run -A --no-config --no-lock --import-map="${build}/vendor/import_map.json" "${build}/src/app.ts" "$@"
''
