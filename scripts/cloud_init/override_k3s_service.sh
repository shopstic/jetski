#!/usr/bin/env bash

set -euo pipefail

mkdir -p /etc/systemd/system/k3s.service.d
mkdir -p /etc/systemd/system/k3s-agent.service.d

cat >/etc/systemd/system/k3s.service.d/override.conf <<EOF
[Service]
KillSignal=SIGTERM
TimeoutStopSec=10
EOF

cat >/etc/systemd/system/k3s-agent.service.d/override.conf <<EOF
[Service]
KillSignal=SIGTERM
TimeoutStopSec=10
EOF