#!/usr/bin/env bash
set -euo pipefail

# Full images do not inherit the maintained slim image. Apply the same native
# distrust rule and supported Node versions before downloading or capturing.
sudo sed -i -e 's|^mozilla/emSign_ECC_Root_CA_-_G3.crt|!&|' \
  -e 's|^mozilla/Comodo_AAA_Services_root.crt|!&|' /etc/ca-certificates.conf
sudo update-ca-certificates

case "$(uname -m)" in
  x86_64)
    architecture=x64
    node22_checksum=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
    node24_checksum=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6
    ;;
  aarch64)
    architecture=arm64
    node22_checksum=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b
    node24_checksum=dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e
    ;;
  *) echo 'Unsupported Node capture architecture' >&2; exit 1 ;;
esac
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
install_node() {
  local version=$1
  local checksum=$2
  local archive="$scratch/node-v${version}-linux-${architecture}.tar.xz"
  local destination="/opt/hostedtoolcache/node/${version}/${architecture}"
  curl --fail --silent --show-error --location --retry 2 \
    --connect-timeout 15 --max-time 180 \
    "https://nodejs.org/dist/v${version}/node-v${version}-linux-${architecture}.tar.xz" \
    --output "$archive"
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
  sudo mkdir -p "$destination"
  sudo tar -xJf "$archive" --strip-components=1 -C "$destination"
  sudo touch "/opt/hostedtoolcache/node/${version}/${architecture}.complete"
  test "$("$destination/bin/node" --version)" = "v${version}"
}
install_node 22.23.4 "$node22_checksum"
install_node 24.22.1 "$node24_checksum"

# Old tool-cache versions remain selectable by setup-node unless removed.
# Keep supported Node 22 and 24, as in the maintained slim image contract.
for directory in /opt/hostedtoolcache/node/*; do
  version=$(basename "$directory")
  case "$version" in
    22.*) minimum=22.23.4 ;;
    24.*) minimum=24.22.1 ;;
    26.*) minimum=26.12.1 ;;
    *) sudo rm -rf -- "$directory"; continue ;;
  esac
  if [[ "$(printf '%s\n' "$minimum" "$version" | sort -V | head -1)" != "$minimum" ]]; then
    sudo rm -rf -- "$directory"
  fi
done
for command in node npm npx corepack; do
  sudo ln -sfn "/opt/hostedtoolcache/node/24.22.1/${architecture}/bin/${command}" "/usr/local/bin/${command}"
done
