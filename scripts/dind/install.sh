#!/usr/bin/env bash
set -Eeuo pipefail

case "${TARGETARCH:-amd64}" in
  amd64 | arm64) ;;
  *)
    echo "Only linux/amd64 and linux/arm64 are supported" >&2
    exit 1
    ;;
esac

if [[ "${UBUNTU_VERSION:?UBUNTU_VERSION is required}" != "24.04" ]]; then
  echo "The dind flavor supports only Ubuntu 24.04" >&2
  exit 1
fi

installer=/tmp/install-docker.sh
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/docker/docker-install/5ce20f2eef3615d08fea941eda5a109e949e8ebf/install.sh \
  --output "$installer"
echo "b991f2806186f7287bb9e53362060c382e906d154599b2fb0982f34246bacfd4  $installer" \
  | sha256sum --check --strict
sh "$installer" --setup-repo

DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  "containerd.io=${CONTAINERD_VERSION:?CONTAINERD_VERSION is required}" \
  "docker-buildx-plugin=${DOCKER_BUILDX_VERSION:?DOCKER_BUILDX_VERSION is required}" \
  "docker-ce-cli=${DOCKER_VERSION:?DOCKER_VERSION is required}" \
  "docker-ce=${DOCKER_VERSION}" \
  "docker-compose-plugin=${DOCKER_COMPOSE_VERSION:?DOCKER_COMPOSE_VERSION is required}" \
  "fuse-overlayfs=${FUSE_OVERLAYFS_VERSION:?FUSE_OVERLAYFS_VERSION is required}"

rm -f "$installer"
apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/*

docker --version
docker buildx version
docker compose version
fuse-overlayfs --version
