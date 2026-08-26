#!/usr/bin/env bash
set -Eeuo pipefail

documentation="docs/image-selection.md"

while IFS= read -r package; do
  if ! grep -Fq "\`${package}\`" "$documentation"; then
    echo "Slim package is missing from ${documentation}: ${package}" >&2
    exit 1
  fi
done < <(
  sed -n '/^packages=(/,/^)/p' scripts/slim/install.sh |
    sed -n -E 's/^  ([a-z0-9+.-]+)$/\1/p'
)

while IFS= read -r version; do
  if ! grep -Fq "$version" "$documentation"; then
    echo "Node.js version is missing from ${documentation}: ${version}" >&2
    exit 1
  fi
done < <(sed -n -E 's/^ARG NODE[0-9]+_VERSION=([0-9.]+)$/\1/p' Dockerfile.slim)
