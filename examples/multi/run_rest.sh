#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")

for i in $(seq 2 7); do
  MULTIPASS_SERVER_ADDRESS="um790-${i}:51000" "${SCRIPT_DIR}"/../../cli.sh run --config ./examples/multi/multi-"${i}".ts "$@"
done