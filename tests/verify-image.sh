#!/usr/bin/env bash
set -Eeuo pipefail

expected_version="${1:?expected Ubuntu version is required}"

test "$(dpkg --print-architecture)" = "amd64"
actual_version="$(sed -n -E 's/^VERSION_ID="?([^"[:space:]]+)"?$/\1/p' /etc/os-release)"
test "$actual_version" = "$expected_version"

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
