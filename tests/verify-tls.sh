#!/usr/bin/env bash
set -euo pipefail

# Public certificate fixtures from https://emudhra.we-have-a-problem.com/chains.zip.
# Check the native trust store without sending traffic or credentials.
fixtures="$(cd "$(dirname "$0")" && pwd)/tls-chains"
bundle="${1:-/etc/ssl/certs/ca-certificates.crt}"
test -s "$bundle"
for chain in "$fixtures"/*.pem; do
  host="$(basename "$chain" .pem)"
  if output=$(openssl verify -no-CApath -no-CAstore -purpose sslserver \
    -verify_hostname "$host" -CAfile "$bundle" -untrusted "$chain" "$chain" 2>&1); then
    echo "Unsafe trust store: accepted $host" >&2
    exit 1
  fi
  if ! grep -Eq 'unable to get local issuer certificate|certificate signature failure|certificate revoked|certificate rejected' <<<"$output"; then
    echo "Inconclusive certificate check: $output" >&2
    exit 1
  fi
done
echo 'System trust rejects all 12 affected chains.'

# Full runner captures can carry several Node versions outside the active PATH.
# Reject every unsupported/old copy, not only the default executable.
if [[ -d /opt/hostedtoolcache/node ]]; then
  while IFS= read -r -d '' executable; do
    version=$("$executable" -p 'process.versions.node')
    major=${version%%.*}
    case "$major" in
      22) minimum=22.23.4 ;;
      24) minimum=24.22.1 ;;
      26) minimum=26.12.1 ;;
      *) echo "Unverified Node version: $executable ($version)" >&2; exit 1 ;;
    esac
    if [[ "$(printf '%s\n' "$minimum" "$version" | sort -V | head -1)" != "$minimum" ]]; then
      echo "Unpatched Node: $executable ($version)" >&2
      exit 1
    fi
    "$executable" "$(dirname "$0")/verify-node-tls.cjs"
  done < <(find /opt/hostedtoolcache/node -type f -path '*/bin/node' -print0)
fi

node "$(dirname "$0")/verify-node-tls.cjs"
