#!/usr/bin/env bash
set -Eeuo pipefail

owner="${1:?owner is required}"
ubuntu="${2:?Ubuntu version is required}"
flavor="${3:?image flavor is required}"

case "${ubuntu}:${flavor}" in
  22.04:slim | 22.04:full | \
    24.04:slim | 24.04:full | 24.04:dind | 24.04:chrome | 24.04:dind-chrome | \
    26.04:slim | 26.04:full) ;;
  *)
    echo "Unsupported image: Ubuntu ${ubuntu} ${flavor}" >&2
    exit 2
    ;;
esac

# The canonical package is always first. Callers use the remaining lines as
# aliases that reference the same image manifest.
printf '%s\n' \
  "${owner}/gha-ubuntu-${ubuntu}-${flavor}" \
  "${owner}/ubuntu-${ubuntu}-${flavor}"

if [[ "$flavor" == full ]]; then
  printf '%s\n' \
    "${owner}/gha-ubuntu-${ubuntu}" \
    "${owner}/ubuntu-${ubuntu}"
fi

if [[ "$ubuntu" == 24.04 ]]; then
  printf '%s\n' \
    "${owner}/gha-ubuntu-latest-${flavor}" \
    "${owner}/ubuntu-latest-${flavor}"

  if [[ "$flavor" == full ]]; then
    printf '%s\n' \
      "${owner}/gha-ubuntu-latest" \
      "${owner}/ubuntu-latest"
  fi
fi
