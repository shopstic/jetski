#!/usr/bin/env bash

set -euo pipefail

arch="amd64"

if [[ "$(uname -m)" == "aarch64" ]]; then
  arch="arm64"
fi

wget -qO /usr/bin/yq https://github.com/mikefarah/yq/releases/download/v4.35.2/yq_linux_"${arch}"

chmod +x /usr/bin/yq

readarray ifaces < <(yq -o=j -I=0 '.network.ethernets | to_entries | .[]' /etc/netplan/50-cloud-init.yaml)

declare -p ifaces

mkdir -p /etc/netplan

cat >/etc/netplan/99-netcfg-static.yaml <<EOF
network:
  version: 2
  ethernets:
EOF

chmod 0700 /etc/netplan/*

lastIp=""
lastIface=""
lastName=""

for iface in "${ifaces[@]}"; do
  lastName=$(echo "$iface" | yq '.key' -) || exit $?
  mac=$(echo "$iface" | yq '.value.match.macaddress' -) || exit $?
  lastIface=$(ip -br link | awk -v mac="$mac" '$3 ~ mac { print $1 }') || exit $?
  lastIp=$(wait_for_interface.sh "$lastIface") || exit $?

  {
    echo "    ${lastName}:"
    echo "      addresses:"
    echo "        - ${lastIp}"
  } >>/etc/netplan/99-netcfg-static.yaml
done

echo "$lastIface" >/etc/node-external-iface
echo "$lastIp" | awk -F/ '{print $1}' >/etc/node-external-ip
cat /etc/netplan/99-netcfg-static.yaml
netplan apply

echo "Waiting for network to come back up..."

while ! ping -c 1 -W 1 8.8.8.8; do
  sleep 1
  echo "Still waiting for network to come back up..."
done
