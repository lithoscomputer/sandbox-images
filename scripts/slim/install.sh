#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${TARGETARCH:-amd64}" != "amd64" ]]; then
  echo "Only linux/amd64 is supported" >&2
  exit 1
fi

if [[ -n "${APT_SNAPSHOT:-}" ]]; then
  snapshot_uri="https://snapshot.ubuntu.com/ubuntu/${APT_SNAPSHOT}/"

  if [[ -f /etc/apt/sources.list.d/ubuntu.sources ]]; then
    sed -i -E "s#^URIs: .+#URIs: ${snapshot_uri}#" /etc/apt/sources.list.d/ubuntu.sources
  fi

  if [[ -f /etc/apt/sources.list ]]; then
    sed -i -E \
      "s#https?://(archive|security)\.ubuntu\.com/ubuntu/?#${snapshot_uri}#g" \
      /etc/apt/sources.list
  fi

  # The minimal Ubuntu image does not contain a CA bundle. The Ubuntu archive
  # signature still authenticates this one bootstrap transaction. All later
  # HTTPS requests use normal certificate verification.
  apt-get -o Acquire::https::Verify-Peer=false update
  apt-get -o Acquire::https::Verify-Peer=false install -y --no-install-recommends ca-certificates
fi

packages=(
  apt-transport-https
  build-essential
  ca-certificates
  curl
  file
  git
  git-lfs
  gnupg
  jq
  locales
  openssh-client
  pipx
  python3
  python3-pip
  python3-venv
  rsync
  shellcheck
  sudo
  tar
  unzip
  wget
  xz-utils
  zip
  zstd
)

apt-get update
apt-get upgrade -y
apt-get install -y --no-install-recommends "${packages[@]}"

ln -sf "$(command -v python3)" /usr/local/bin/python
git config --system --add safe.directory '*'

mkdir -p \
  /github \
  /opt/acttoolcache \
  /opt/hostedtoolcache \
  /workspace
chmod 0777 \
  /github \
  /opt/acttoolcache \
  /opt/hostedtoolcache \
  /workspace

install_node() {
  local version="$1"
  local archive="node-v${version}-linux-x64.tar.xz"
  local destination="/opt/hostedtoolcache/node/${version}/x64"

  mkdir -p "$destination"
  curl --fail --location --retry 3 \
    "https://nodejs.org/dist/v${version}/${archive}" \
    --output "/tmp/${archive}"
  curl --fail --location --retry 3 \
    "https://nodejs.org/dist/v${version}/SHASUMS256.txt" \
    --output "/tmp/SHASUMS256-${version}.txt"
  (
    cd /tmp
    grep " ${archive}$" "SHASUMS256-${version}.txt" | sha256sum --check --strict -
  )
  python3 - "/tmp/${archive}" "$destination" <<'PY'
import pathlib
import sys
import tarfile

archive = sys.argv[1]
destination = pathlib.Path(sys.argv[2])
with tarfile.open(archive, "r:xz") as source:
    for member in source.getmembers():
        parts = pathlib.PurePosixPath(member.name).parts[1:]
        if not parts:
            continue
        member.name = str(pathlib.PurePosixPath(*parts))
        source.extract(member, destination)
PY
  touch "/opt/hostedtoolcache/node/${version}/x64.complete"
  rm -f "/tmp/${archive}" "/tmp/SHASUMS256-${version}.txt"
}

install_node "${NODE20_VERSION:?NODE20_VERSION is required}"
install_node "${NODE22_VERSION:?NODE22_VERSION is required}"
install_node "${NODE24_VERSION:?NODE24_VERSION is required}"

rm -rf /opt/acttoolcache/node
ln -s /opt/hostedtoolcache/node /opt/acttoolcache/node
for command in node npm npx corepack; do
  ln -sf "/opt/hostedtoolcache/node/${NODE24_VERSION}/x64/bin/${command}" "/usr/local/bin/${command}"
done

ubuntu_major="${UBUNTU_VERSION%%.*}"
cat >>/etc/environment <<EOF
ImageOS=ubuntu${ubuntu_major}
IMAGE_OS=ubuntu${ubuntu_major}
LSB_RELEASE=${UBUNTU_VERSION}
AGENT_TOOLSDIRECTORY=/opt/hostedtoolcache
RUNNER_TOOL_CACHE=/opt/hostedtoolcache
RUN_TOOL_CACHE=/opt/hostedtoolcache
ACT_TOOLSDIRECTORY=/opt/acttoolcache
EOF

apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/*
