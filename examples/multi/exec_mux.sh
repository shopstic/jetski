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

# Initialize the tmux command string
tmux_cmd="tmux "

# Retrieve the script directory
SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")

# Generate the tmux command
first_node=true
for node_id in "${node_ids[@]}"; do
  cmd_to_run="${SCRIPT_DIR}/exec.sh ${node_id} -- ${args[*]}; bash"
  if $first_node; then
    tmux_cmd+="new-session  '$cmd_to_run;' \\; "
    first_node=false
  else
    tmux_cmd+="split-window '$cmd_to_run' \\; "
  fi
done

tmux_cmd+="select-layout even-vertical \\;"
# tmux_cmd+=" resize-pane -x 800 -y 600"

# echo "$tmux_cmd"
# Execute the generated tmux command
eval "$tmux_cmd"
