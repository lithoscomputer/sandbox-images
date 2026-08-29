#!/usr/bin/env bash
set -Eeuo pipefail

expected_version="${1:?expected Ubuntu version is required}"
expected_flavor="${2:-slim}"
expected_architecture="${3:-$(dpkg --print-architecture)}"

case "$expected_architecture" in
  amd64) toolcache_arch=x64 ;;
  arm64) toolcache_arch=arm64 ;;
  *)
    echo "Unknown image architecture: $expected_architecture" >&2
    exit 2
    ;;
esac
test "$(dpkg --print-architecture)" = "$expected_architecture"
actual_version="$(sed -n -E 's/^VERSION_ID="?([^"[:space:]]+)"?$/\1/p' /etc/os-release)"
test "$actual_version" = "$expected_version"

for command in bash curl gh git git-lfs ip jq node npm ps python python3 rg ss sudo tar unzip wget zip zstd; do
  command -v "$command" >/dev/null || {
    echo "Missing command: $command" >&2
    exit 1
  }
done

test "${LANG:-}" = "C.UTF-8"
test -z "${LC_ALL+x}"
python3 -c 'import jsonschema'
findmnt --version >/dev/null

# Shared libraries that prebuilt tool-cache toolchains link against — the lib*
# set GitHub's ubuntu-slim ships. Ruby builds from ruby/setup-ruby load libyaml
# through psych on every `gem` invocation; the headers and pkg-config serve
# native-extension builds inside actions (setup-ruby's bundler-cache).
# No `grep -q` here: under pipefail its early exit turns ldconfig's SIGPIPE
# into status 141.
ldconfig -p | grep -F libyaml-0.so.2 >/dev/null
pkg-config --exists yaml-0.1 openssl sqlite3

test -d /opt/hostedtoolcache
test -w /opt/hostedtoolcache
test -x "/opt/hostedtoolcache/node/20.20.2/${toolcache_arch}/bin/node"
test -x "/opt/hostedtoolcache/node/22.23.2/${toolcache_arch}/bin/node"
test -x "/opt/hostedtoolcache/node/24.19.0/${toolcache_arch}/bin/node"

verify_dind() {
  for command in containerd docker dockerd fuse-overlayfs start-docker; do
    command -v "$command" >/dev/null || {
      echo "Missing dind command: $command" >&2
      exit 1
    }
  done
  docker buildx version >/dev/null
  docker compose version >/dev/null
  test "${DOCKER_PROVIDER_WAIT_SECONDS:-}" = 10
  test "${DOCKER_START_WAIT_SECONDS:-}" = 30
  test "${DOCKER_DIAGNOSTIC_LOG:-}" = /tmp/docker-start.log
  test "${DOCKER_LOG_PATH:-}" = /var/log/docker.log
}

verify_chrome() {
  for command in agent-browser chrome ffmpeg google-chrome google-chrome-stable playwright-mcp; do
    command -v "$command" >/dev/null || {
      echo "Missing Chrome command: $command" >&2
      exit 1
    }
  done
  test "${CHROME_BIN:-}" = /usr/local/bin/chrome
  test "${AGENT_BROWSER_ENGINE:-}" = chrome
  test "${AGENT_BROWSER_EXECUTABLE_PATH:-}" = /usr/local/bin/chrome
  test "${AGENT_BROWSER_CONTENT_BOUNDARIES:-}" = 1
  test "${AGENT_BROWSER_MAX_OUTPUT:-}" = 50000
  chrome --version
  agent-browser --version
  playwright-mcp --help >/dev/null
}

case "$expected_flavor" in
  slim) ;;
  dind) verify_dind ;;
  chrome) verify_chrome ;;
  dind-chrome)
    verify_dind
    verify_chrome
    ;;
  *)
    echo "Unknown image flavor: $expected_flavor" >&2
    exit 2
    ;;
esac
