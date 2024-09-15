#!/usr/bin/env bash
set -euo pipefail
shopt -s extglob globstar

SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")

check_all() {
  deno check ./**/*.ts
}

code_quality() {
  echo "Checking formatting..."
  deno fmt --check
  echo "Linting..."
  deno lint
  echo "Running eslint..."
  eslint .
}

auto_fmt() {
  deno fmt
}

update_lock() {
  rm -f deno.lock
  deno cache  --reload "${SCRIPT_DIR}"/src/deps.ts "${SCRIPT_DIR}"/src/app.ts --lock ./deno.lock --frozen=false
}

update_deps() {
  deno run -A jsr:@wok/deup@1.3.1 update "$@"
  "$0" update_lock
}

run() {
  export JETSKI_ENABLE_STACKTRACE=${JETSKI_ENABLE_STACKTRACE:-"0"}
  deno run -A --check "${SCRIPT_DIR}"/src/app.ts "$@"
}

set_version() {
  local VERSION=${1:-"dev"}
  local JSR_JSON
  JSR_JSON=$(jq -e --arg VERSION "${VERSION}" '.version=$VERSION' ./deno.json)
  echo "${JSR_JSON}" >./deno.json
}

jsr_publish() {
  deno publish --config ./deno.json --allow-slow-types --allow-dirty
}

create_release() {
  local RELEASE_VERSION=${1:?"Release version is required"}
  local RELEASE_BRANCH="releases/${RELEASE_VERSION}"

  git config --global user.email "ci-runner@shopstic.com"
  git config --global user.name "CI Runner"
  git checkout -b "${RELEASE_BRANCH}"

  git add ./deno.json
  git commit -m "Release ${RELEASE_VERSION}"
  git push origin "${RELEASE_BRANCH}"

  gh release create "${RELEASE_VERSION}" --title "Release ${RELEASE_VERSION}" --notes "" --target "${RELEASE_BRANCH}"
}

"$@"