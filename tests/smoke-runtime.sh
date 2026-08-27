#!/usr/bin/env bash
set -Eeuo pipefail

flavor="${1:?image flavor is required}"

smoke_dind() {
  start-docker
  docker info --format 'Docker server={{.ServerVersion}} storage={{.Driver}}'

  local context
  context="$(mktemp -d)"
  printf 'runtime smoke test\n' >"${context}/marker"
  printf 'FROM scratch\nCOPY marker /marker\n' >"${context}/Dockerfile"
  docker build --tag gha-runtime-smoke "$context"
  test "$(docker image inspect --format '{{.Architecture}}' gha-runtime-smoke)" = amd64
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
