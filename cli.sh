#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")

code_quality() {
  echo "Checking formatting..."
  deno fmt --check
  echo "Linting..."
  deno lint
}

auto_fmt() {
  deno fmt
}

update_cache() {
  deno cache --lock=deno.lock "${SCRIPT_DIR}"/src/deps.ts "${SCRIPT_DIR}"/src/app.ts
}

update_lock() {
  rm -f deno.lock
  deno cache --reload "${SCRIPT_DIR}"/src/deps.ts "${SCRIPT_DIR}"/src/app.ts
  deno cache "${SCRIPT_DIR}"/src/deps.ts "${SCRIPT_DIR}"/src/app.ts --lock ./deno.lock --lock-write
}

run() {
  export JETSKI_ENABLE_STACKTRACE=${JETSKI_ENABLE_STACKTRACE:-"0"}
  deno run -A --check "${SCRIPT_DIR}"/src/app.ts "$@"
}

"$@"