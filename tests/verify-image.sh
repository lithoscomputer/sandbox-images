#!/usr/bin/env bash
set -Eeuo pipefail

expected_version="${1:?expected Ubuntu version is required}"

test "$(dpkg --print-architecture)" = "amd64"
test "$(. /etc/os-release && echo "$VERSION_ID")" = "$expected_version"

for command in bash curl git git-lfs jq node npm python python3 sudo tar unzip wget zip zstd; do
  command -v "$command" >/dev/null || {
    echo "Missing command: $command" >&2
    exit 1
  }
done

test -d /opt/hostedtoolcache
test -w /opt/hostedtoolcache
test -x /opt/hostedtoolcache/node/20.20.2/x64/bin/node
test -x /opt/hostedtoolcache/node/22.23.2/x64/bin/node
test -x /opt/hostedtoolcache/node/24.19.0/x64/bin/node
