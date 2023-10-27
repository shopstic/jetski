#!/usr/bin/env bash

set -euo pipefail

# Update those accordingly
BR_INTERFACE="enp2s0"
BR_STATIC_ADDRESS="10.255.250.6/21"
BR_DEFAULT_GATEWAY="10.255.248.1"
BR_NAMESERVER="127.0.0.53"

cat >/etc/netplan/99-multipass-bridge.yaml <<EOF
network:
  version: 2
  renderer: networkd
  bridges:
    br0:
      dhcp4: false
      addresses: [$BR_STATIC_ADDRESS]
      interfaces:
        - $BR_INTERFACE
      routes:
        - to: default
          via: $BR_DEFAULT_GATEWAY
      nameservers:
        addresses: [$BR_NAMESERVER]
      parameters:
        forward-delay: 0
        stp: false
      optional: true
EOF

chmod 0700 /etc/netplan/*
netplan try
netplan apply

# Install multipass
snap install multipass

# Install lxd
snap install lxd

# Configure lxd
cat <<EOF | lxd init --preseed
config: {}
networks: []
storage_pools:
- config:
    size: 500GiB
  description: ""
  name: multipass_vm
  driver: lvm
profiles:
- config: {}
  description: ""
  devices:
    eth0:
      name: eth0
      nictype: bridged
      parent: br0
      type: nic
    root:
      path: /
      pool: multipass_vm
      type: disk
  name: default
projects: []
cluster: null
EOF

multipass set local.driver=lxd
snap connect multipass:lxd lxd
multipass set local.passphrase=foo
multipass set local.bridged-network=br0

mkdir -p /etc/systemd/system/snap.multipass.multipassd.service.d
cat >/etc/systemd/system/snap.multipass.multipassd.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/snap run multipass.multipassd --verbosity debug --logger stderr --address $(hostname):51001
EOF

cat << EOF > /etc/systemd/system/multipassd-proxy.service
[Unit]
Description=Multipassd Socat TCP Proxy Service
After=network.target

[Service]
ExecStart=/usr/bin/socat TCP-LISTEN:51000,bind=0.0.0.0,reuseaddr,fork TCP:127.0.1.1:51001
Restart=always
User=nobody
RestartSec=1
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl restart snap.multipass.multipassd.service
systemctl enable --now multipassd-proxy.service

# Test it
export MULTIPASS_SERVER_ADDRESS="$(hostname):51000"
multipass version