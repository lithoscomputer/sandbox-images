#!/usr/bin/env bash
set -Eeuo pipefail

assert_aliases() {
  local ubuntu="$1"
  local flavor="$2"
  local expected="$3"
  local actual

  actual="$(scripts/image-aliases.sh lithoscomputer "$ubuntu" "$flavor")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'Unexpected aliases for Ubuntu %s %s\nExpected:\n%s\nActual:\n%s\n' \
      "$ubuntu" "$flavor" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_aliases 22.04 slim $'lithoscomputer/gha-ubuntu-22.04-slim\nlithoscomputer/ubuntu-22.04-slim'

assert_aliases 24.04 dind $'lithoscomputer/gha-ubuntu-24.04-dind\nlithoscomputer/ubuntu-24.04-dind\nlithoscomputer/gha-ubuntu-latest-dind\nlithoscomputer/ubuntu-latest-dind'

assert_aliases 24.04 full $'lithoscomputer/gha-ubuntu-24.04-full\nlithoscomputer/ubuntu-24.04-full\nlithoscomputer/gha-ubuntu-24.04\nlithoscomputer/ubuntu-24.04\nlithoscomputer/gha-ubuntu-latest-full\nlithoscomputer/ubuntu-latest-full\nlithoscomputer/gha-ubuntu-latest\nlithoscomputer/ubuntu-latest'

assert_aliases 26.04 full $'lithoscomputer/gha-ubuntu-26.04-full\nlithoscomputer/ubuntu-26.04-full\nlithoscomputer/gha-ubuntu-26.04\nlithoscomputer/ubuntu-26.04'

if scripts/image-aliases.sh lithoscomputer 22.04 chrome >/dev/null 2>&1; then
  echo 'Unsupported aliases must fail' >&2
  exit 1
fi
