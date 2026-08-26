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
    # These paths are part of the container contract, but they are not present
    # on every hosted runner filesystem.
    sudo install -d -m 0777 /github /workspace
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
    sudo ln -sfn hostedtoolcache /opt/acttoolcache
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

set +e
sudo tar "${tar_args[@]}" \
  | tee >(sha256sum | awk '{print $1}' >"$uncompressed_sha") \
  | gzip -1 -c \
  | tee >(sha256sum | awk '{print $1}' >"$compressed_sha") \
  | node scripts/full/registry.mjs upload-layer \
      --diff-id-file "$uncompressed_sha" \
      --digest-file "$compressed_sha" \
      --output "$metadata_dir/${name}.json"
pipeline_status=("${PIPESTATUS[@]}")
set -e

# A live runner can change while tar reads it. GNU tar uses status 1 for that
# recoverable condition and status 2 for a fatal archive error.
if (( pipeline_status[0] > 1 )); then
  exit "${pipeline_status[0]}"
fi
for status in "${pipeline_status[@]:1}"; do
  if (( status != 0 )); then
    exit "$status"
  fi
done
if (( pipeline_status[0] == 1 )); then
  echo "Archive completed with files that changed during capture" >&2
fi
