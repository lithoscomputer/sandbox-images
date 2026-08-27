# Development

This guide is for people who change, build, test, or publish images from the `sandbox-images` repository. User-facing image selection stays in the [README](../README.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `Dockerfile.slim` | Slim, Dind, Chrome, and Dind + Chrome build stages and pinned tool versions |
| `scripts/slim/` | Shared slim package and tool installation |
| `scripts/dind/` | Docker installation and the `start-docker` command |
| `scripts/chrome/` | Chrome and browser-tool installation |
| `scripts/full/` | GitHub runner filesystem capture and OCI publication |
| `scripts/aliases/` | Cross-package OCI manifest publication for full aliases |
| `scripts/image-aliases.sh` | Supported image matrix and alias mapping |
| `tests/` | Static, registry, image-content, documentation, and runtime checks |
| `.github/workflows/` | Validation, maintained builds, full capture, and alias synchronization |

## Supported build matrix

| Ubuntu | `slim` | `dind` | `chrome` | `dind-chrome` | `full` |
| --- | --- | --- | --- | --- | --- |
| 22.04 | Yes | No | No | No | Yes |
| 24.04 | Yes | Yes | Yes | Yes | Yes |
| 26.04 | Yes | No | No | No | Yes |

Every published image uses `linux/amd64`.

Keep the matrix in `scripts/image-aliases.sh`, the maintained workflow matrix, the validation matrix, and the README synchronized.

## Dependency safety

Never install a package or release that is less than 24 hours old.

Maintained builds use an Ubuntu package repository snapshot from 48 hours before the workflow starts. Keep this delay at least 24 hours. New downloaded tools must use reviewed, pinned versions that are more than 24 hours old. Add and verify a checksum when the upstream distribution supports one.

GitHub Actions must use full commit SHA pins. Run pedantic Zizmor after changing a workflow.

## Maintained image build

`Dockerfile.slim` contains four build stages:

- `slim` installs the shared Ubuntu packages, pinned Node.js versions, GitHub CLI, paths, and environment variables.
- `dind` starts from `slim` and adds Docker.
- `chrome` starts from `slim` and adds the browser stack.
- `dind-chrome` starts from `chrome` and adds Docker.

The daily workflow builds six images: three slim releases and the three focused Ubuntu 24.04 variants. It publishes canonical packages and maintained aliases in the same Buildx operation.

After publication, the workflow verifies the immutable image and every alias. Dind and Chrome variants also run `tests/smoke-runtime.sh`.

## Full image capture

The full workflow runs on the matching GitHub-hosted runner and streams each filesystem layer directly to GHCR. The images are large, so avoid an unnecessary capture.

The capture workflow must remain small. Do not run untrusted code before the capture. The checkout action is the only third-party action allowed before filesystem collection, and the checkout directory is excluded from the image.

The workflow checks the runner `ImageVersion` before capture. Scheduled runs skip an existing version. A push that changes `build-full.yml` or `scripts/full/` forces capture so changes to the capture implementation receive a new image.

Alias mapping changes do not trigger full capture. `sync-full-aliases.yml` copies the current canonical manifests to the alias packages.

See [Full images](full-images.md) for layer and exclusion details.

## Workflows and schedules

| Workflow | Automatic triggers | Purpose |
| --- | --- | --- |
| `validate.yml` | Every pull request and push | Run repository checks and Dockerfile validation |
| `build-slim.yml` | Relevant pull requests and pushes; daily at 05:23 UTC | Build and publish maintained images |
| `build-full.yml` | Capture implementation changes; daily at 08:47 UTC | Check runner versions and capture new full images |
| `sync-full-aliases.yml` | Alias implementation or mapping changes; called after full capture | Publish full image aliases without filesystem capture |

Manual runs can select a maintained release and flavor, or a full release and force option.

The daily schedules use off-peak minutes because GitHub can delay workflows during high load. GitHub normally updates runner images weekly, and deployment can take several days. A daily version check catches each release after it reaches the runner pool without uploading an unchanged filesystem each day.

## Local maintained build

Choose an Ubuntu package snapshot that is at least 24 hours old:

```bash
docker buildx build \
  --platform linux/amd64 \
  --target slim \
  --build-arg UBUNTU_VERSION=24.04 \
  --build-arg IMAGE_OS=ubuntu24 \
  --build-arg APT_SNAPSHOT=<YYYYMMDD>T000000Z \
  --tag gha-ubuntu-24.04-slim:local \
  --load \
  --file Dockerfile.slim .
```

Replace the target and tag with `dind`, `chrome`, or `dind-chrome` for a focused Ubuntu 24.04 build.

Verify the image:

```bash
docker run --rm \
  --volume "$PWD/tests:/tests:ro" \
  gha-ubuntu-24.04-slim:local \
  /tests/verify-image.sh 24.04 slim
```

Run a Dind smoke test in a privileged container:

```bash
docker run --rm --privileged \
  --volume "$PWD/tests:/tests:ro" \
  gha-ubuntu-24.04-dind:local \
  /tests/smoke-runtime.sh dind
```

Run a Chrome smoke test with additional shared memory:

```bash
docker run --rm --shm-size=1g \
  --volume "$PWD/tests:/tests:ro" \
  gha-ubuntu-24.04-chrome:local \
  /tests/smoke-runtime.sh chrome
```

## Repository validation

Run these checks before pushing a change:

```bash
bash -n scripts/image-aliases.sh scripts/slim/install.sh scripts/dind/install.sh scripts/dind/start-docker scripts/chrome/install.sh scripts/full/capture-layer.sh tests/image-aliases.sh tests/smoke-runtime.sh tests/verify-image.sh
shellcheck scripts/image-aliases.sh scripts/slim/install.sh scripts/dind/install.sh scripts/dind/start-docker scripts/chrome/install.sh scripts/full/capture-layer.sh tests/image-aliases.sh tests/smoke-runtime.sh tests/verify-image.sh
tests/image-aliases.sh
node --check scripts/full/registry.mjs
node --check scripts/aliases/registry.mjs
node tests/registry-upload.mjs
node tests/registry-aliases.mjs
zizmor --pedantic .github/workflows
git diff --check
```

Also parse every workflow after YAML changes and inspect the GitHub run after pushing.

## Change an installed package

For a shared Ubuntu package:

1. Update the package array in `scripts/slim/install.sh`.
2. Update [Slim images](slim-images.md).
3. Update `tests/verify-image.sh` when the command is part of the supported contract.
4. Build and verify each affected Ubuntu release.

For a pinned downloaded tool:

1. Select a release that is more than 24 hours old.
2. Update its version in `Dockerfile.slim`.
3. Update its checksum or pinned Ubuntu package version.
4. Update the relevant image-family document.
5. Run the content and runtime tests.

## Change aliases

Update `scripts/image-aliases.sh`, the complete mapping in the README, and `tests/image-aliases.sh` together. The full alias workflow can publish mapping changes without recapturing full images.

Do not move the `ubuntu-latest` family as a side effect of another change. Treat that mapping as a deliberate compatibility decision.

## GHCR access

Build workflows use `GITHUB_TOKEN` with package write access. Packages inherit repository access when first created. Package visibility is an explicit operational decision and is separate from repository visibility.

Before making packages public, verify the README, immutable tags, aliases, image labels, and runtime tests from an unauthenticated environment.
