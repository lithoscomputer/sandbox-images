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
  DEBIAN_FRONTEND=noninteractive apt-get \
    -o Acquire::https::Verify-Peer=false \
    install -y --no-install-recommends ca-certificates
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
  iproute2
  jq
  libmysqlclient-dev
  libsqlite3-dev
  libssl-dev
  libxml2-dev
  libyaml-dev
  locales
  openssh-client
  pipx
  pkg-config
  procps
  python3
  python3-jsonschema
  python3-pip
  python3-venv
  ripgrep
  rsync
  shellcheck
  sudo
  tar
  unzip
  util-linux
  wget
  xz-utils
  zip
  zstd
)

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}"

gh_version="${GH_VERSION:?GH_VERSION is required}"
gh_archive="/tmp/gh_${gh_version}_linux_amd64.tar.gz"
curl --fail --location --silent --show-error --retry 3 \
  "https://github.com/cli/cli/releases/download/v${gh_version}/gh_${gh_version}_linux_amd64.tar.gz" \
  --output "$gh_archive"
echo "${GH_SHA256:?GH_SHA256 is required}  $gh_archive" | sha256sum --check --strict
python3 - "$gh_archive" "/usr/local/bin/gh" "$gh_version" <<'PY'
import os
import shutil
import sys
import tarfile

archive, destination, version = sys.argv[1:]
member_name = f"gh_{version}_linux_amd64/bin/gh"
with tarfile.open(archive, "r:gz") as source:
    member = source.getmember(member_name)
    if not member.isfile():
        raise RuntimeError(f"{member_name} is not a regular file")
    with source.extractfile(member) as input_file, open(destination, "wb") as output_file:
        if input_file is None:
            raise RuntimeError(f"could not read {member_name}")
        shutil.copyfileobj(input_file, output_file)
os.chmod(destination, 0o755)
PY
rm -f "$gh_archive"

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
LANG=C.UTF-8
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
