#!/usr/bin/env bash
set -euo pipefail

code_quality() {
  echo "Checking formatting..."
  deno fmt --check ./src
  echo "Linting..."
  deno lint ./src
}

auto_fmt() {
  deno fmt ./src
}

update_cache() {
  deno cache --lock=deno.lock ./src/deps.ts ./src/app.ts
}

update_lock() {
  rm -f deno.lock
  deno cache --reload ./src/deps.ts ./src/app.ts
  deno cache ./src/deps.ts ./src/app.ts --lock ./deno.lock --lock-write
}

run() {
  export JETSKI_ENABLE_STACKTRACE=${JETSKI_ENABLE_STACKTRACE:-"0"}
  deno run -A --check ./src/app.ts "$@"
}

"$@"