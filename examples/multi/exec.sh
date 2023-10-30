#!/usr/bin/env bash
set -euo pipefail

# Initialize variables to keep track of the state
pre_delim=true
node_ids=()
args=()

# Loop through all arguments
for arg in "$@"; do
  # If we encounter '--', switch to collecting post-delimiter arguments
  if [ "$arg" == "--" ]; then
    pre_delim=false
    continue
  fi
  
  # Collect arguments before and after the delimiter
  if $pre_delim; then
    node_ids+=("$arg")
  else
    args+=("$arg")
  fi
done

SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")
for node_id in "${node_ids[@]}"; do
  MULTIPASS_SERVER_ADDRESS="um790-${node_id}:51000" "${SCRIPT_DIR}"/../../cli.sh run --config ./examples/multi/multi-"${node_id}".ts "${args[@]}"
done
