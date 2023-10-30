#!/usr/bin/env bash

set -euo pipefail

cat >/etc/systemd/timesyncd.conf <<EOF
[Time]
NTP=time.aws.com
FallbackNTP=ntp.ubuntu.com
PollIntervalMinSec=5
PollIntervalMaxSec=60
EOF

systemctl restart systemd-timesyncd
timedatectl status