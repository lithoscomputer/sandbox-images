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

for required_text in \
  'gha-ubuntu-24.04-dind' \
  'gha-ubuntu-24.04-chrome' \
  'gha-ubuntu-24.04-dind-chrome' \
  'LANG=C.UTF-8' \
  'DOCKER_PROVIDER_WAIT_SECONDS' \
  'AGENT_BROWSER_EXECUTABLE_PATH' \
  'start-docker' \
  "no custom \`ENTRYPOINT\`"; do
  if ! grep -Fq "$required_text" "$documentation"; then
    echo "Image contract is missing from ${documentation}: ${required_text}" >&2
    exit 1
  fi
done

if grep -Fq 'LC_ALL=' Dockerfile.slim; then
  echo "Dockerfile.slim must not set LC_ALL globally" >&2
  exit 1
fi

if grep -Eq '^[[:space:]]*ENTRYPOINT' Dockerfile.slim; then
  echo "Maintained images must not define a custom entrypoint" >&2
  exit 1
fi
