#!/usr/bin/env bash
set -euo pipefail

# Full captures retain preinstalled runtimes. Replace every Bun executable that
# the capture includes; changing PATH alone leaves vulnerable copies selectable.
# Release: https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4 (2026-10-22).
roots=()
for root in /usr/local /opt /usr/share /home/linuxbrew /home/runner/.bun; do
  [[ ! -d "$root" ]] || roots+=("$root")
done
mapfile -d '' binaries < <(find "${roots[@]}" -type f -name bun -perm /111 -print0)
if [[ ${#binaries[@]} -eq 0 ]]; then
  echo 'No preinstalled Bun binaries to upgrade.'
  exit 0
fi

case "$(uname -m)" in
  x86_64)
    platform=linux-x64
    checksum=bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c
    ;;
  aarch64)
    platform=linux-aarch64
    checksum=baa6bb36f51d6e58561e02bbea825038a9df454f673d6d776e8bbf86f8c7850e
    ;;
  *) echo 'Unsupported Bun capture architecture' >&2; exit 1 ;;
esac
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
curl --fail --silent --show-error --location \
  "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-${platform}.zip" \
  --output "$scratch/bun.zip"
printf '%s  %s\n' "$checksum" "$scratch/bun.zip" | sha256sum --check --status
unzip -q "$scratch/bun.zip" -d "$scratch"
replacement="$scratch/bun-${platform}/bun"
test "$("$replacement" --version)" = '1.4.4'
for binary in "${binaries[@]}"; do
  sudo install -m 755 "$replacement" "$binary"
  test "$("$binary" --version)" = '1.4.4'
  printf 'Upgraded %s to Bun 1.4.4\n' "$binary"
done
