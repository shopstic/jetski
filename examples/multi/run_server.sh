#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")
MULTIPASS_SERVER_ADDRESS="um790-1:51000" "${SCRIPT_DIR}"/../../cli.sh run --config ./examples/multi/multi-1.ts "$@"
