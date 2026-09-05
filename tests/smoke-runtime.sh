#!/usr/bin/env bash
set -Eeuo pipefail

flavor="${1:?image flavor is required}"
expected_architecture="${2:-$(dpkg --print-architecture)}"

smoke_dind() {
  # Reproduce a stopped sandbox whose saved dockerd PID has been reused by
  # another process. Only write the fixture in an image with no live daemon.
  if docker info > /dev/null 2>&1 || pgrep -x dockerd > /dev/null 2>&1; then
    echo "The Docker startup regression requires a fresh container." >&2
    return 1
  fi
  printf '%s\n' "$$" > /var/run/docker.pid

  local concurrent_start daemon_pid probe_log
  DOCKER_PROVIDER_WAIT_SECONDS=0 start-docker &
  concurrent_start=$!
  DOCKER_PROVIDER_WAIT_SECONDS=0 start-docker
  wait "$concurrent_start"
  daemon_pid=$(cat /var/run/docker.pid)
  test "$daemon_pid" != "$$"

  # A repeated call preserves the live daemon's identity and PID file.
  start-docker
  test "$(cat /var/run/docker.pid)" = "$daemon_pid"

  # An unavailable API is not evidence that the daemon is gone. Force the
  # readiness probes to fail while the real dockerd process remains alive.
  probe_log=$(mktemp)
  if DOCKER_PROVIDER_WAIT_SECONDS=0 DOCKER_START_WAIT_SECONDS=0 \
    bash -c 'docker() { return 1; }; export -f docker; exec start-docker' \
    > "$probe_log" 2>&1; then
    echo "The forced readiness failure unexpectedly succeeded." >&2
    return 1
  fi
  test "$(cat /var/run/docker.pid)" = "$daemon_pid"
  rm -f "$probe_log"

  # Service startup must not leave its lock descriptor in the daemon.
  flock --nonblock /var/run/start-docker.lock true
  docker info --format 'Docker server={{.ServerVersion}} storage={{.Driver}}'

  local context
  context="$(mktemp -d)"
  printf 'runtime smoke test\n' >"${context}/marker"
  printf 'FROM scratch\nCOPY marker /marker\n' >"${context}/Dockerfile"
  docker build --tag gha-runtime-smoke "$context"
  test "$(docker image inspect --format '{{.Architecture}}' gha-runtime-smoke)" = "$expected_architecture"
  docker image rm gha-runtime-smoke >/dev/null
  rm -rf "$context"
}

smoke_chrome() {
  export AGENT_BROWSER_NAMESPACE="gha-runtime-smoke-${GITHUB_RUN_ID:-local}"
  export AGENT_BROWSER_SESSION="gha-runtime-smoke-${GITHUB_RUN_ATTEMPT:-1}"
  trap 'agent-browser close >/dev/null 2>&1 || true' EXIT

  agent-browser open about:blank
  test "$(agent-browser get url)" = about:blank
  agent-browser close
  trap - EXIT
}

case "$flavor" in
  dind) smoke_dind ;;
  chrome) smoke_chrome ;;
  dind-chrome)
    smoke_dind
    smoke_chrome
    ;;
  *)
    echo "Runtime smoke testing is not defined for flavor: $flavor" >&2
    exit 2
    ;;
esac
