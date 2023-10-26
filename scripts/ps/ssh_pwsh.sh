#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]}")")

NODE_ADDRESS=${1:?"The remote node address is required"}
PS_SCRIPT=${2:?"The the powershell script name is required"}

ssh -o LogLevel=error "${NODE_ADDRESS}" powershell.exe -NoLogo -Command - < "${SCRIPT_DIR}/${PS_SCRIPT}.ps1"