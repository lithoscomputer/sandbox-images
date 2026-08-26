#!/usr/bin/env bash
set -Eeuo pipefail

name="${1:?layer name is required}"
metadata_dir="${LAYER_METADATA_DIR:?LAYER_METADATA_DIR is required}"
mkdir -p "$metadata_dir"

tar_args=(
  --acls
  --xattrs
  --numeric-owner
  --ignore-failed-read
  -C /
  -c
)

case "$name" in
  00-root)
    workspace="${GITHUB_WORKSPACE#/}"
    tar_args+=(
      --one-file-system
      --exclude='./dev/*'
      --exclude='./proc/*'
      --exclude='./sys/*'
      --exclude='./run/*'
      --exclude='./tmp/*'
      --exclude='./mnt/*'
      --exclude='./opt/*'
      --exclude='./usr/local/*'
      --exclude='./var/cache/*'
      --exclude='./var/crash/*'
      --exclude='./var/lib/apt/lists/*'
      --exclude='./var/lib/docker/*'
      --exclude='./var/run/*'
      --exclude='./var/tmp/*'
      --exclude='./home/runner/work/*'
      --exclude='./home/runner/runners/*'
      --exclude='./home/runner/.ssh/*'
      --exclude='./home/runner/.cache/*'
      --exclude='./home/runner/.config/*'
      --exclude='./home/runner/.azure/*'
      --exclude='./home/runner/.docker/*'
      --exclude='./home/runner/.credentials*'
      --exclude='./swapfile'
    )
    if [[ -n "$workspace" ]]; then
      tar_args+=(--exclude="./${workspace}")
    fi
    tar_args+=(.)
    ;;
  10-usr-local)
    tar_args+=(usr/local)
    ;;
  20-opt)
    tar_args+=(--exclude='opt/hostedtoolcache/*' opt)
    ;;
  30-toolcache)
    tar_args+=(opt/hostedtoolcache)
    ;;
  *)
    echo "Unknown layer: $name" >&2
    exit 1
    ;;
esac

uncompressed_sha="$RUNNER_TEMP/${name}.diff-id"
compressed_sha="$RUNNER_TEMP/${name}.digest"

sudo tar "${tar_args[@]}" \
  | tee >(sha256sum | awk '{print $1}' >"$uncompressed_sha") \
  | gzip -1 -c \
  | tee >(sha256sum | awk '{print $1}' >"$compressed_sha") \
  | node scripts/full/registry.mjs upload-layer \
      --diff-id-file "$uncompressed_sha" \
      --digest-file "$compressed_sha" \
      --output "$metadata_dir/${name}.json"
