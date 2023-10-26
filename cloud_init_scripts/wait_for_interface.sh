#!/usr/bin/env bash

set -euo pipefail

interface=${1:?"Interface name is required"}

maxAttempts=15

attempts=0

while ! ip addr show "$interface" | grep 'inet ' 1>&2; do
  if [[ $attempts -ge $maxAttempts ]]; then
    echo >&2 "Timed out waiting for $interface to be up."
    exit 1
  fi

  echo >&2 "Waiting for $interface to be up..."
  sleep 1
  attempts=$((attempts + 1))
done

ip addr show "$interface" | grep 'inet ' | awk '{print $2}'
