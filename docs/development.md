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
| `scripts/registry/` | Server-side OCI manifest copying and immutable tag publication |
| `tests/` | Registry, image-content, and runtime checks |
| `.github/workflows/` | Validation, maintained builds, and full capture |

## Published topology

| Ubuntu | `slim` | `dind` | `chrome` | `dind-chrome` | `full` |
| --- | --- | --- | --- | --- | --- |
| 22.04 | Yes | No | No | No | Yes |
| 24.04 | Yes | Yes | Yes | Yes | Yes |
| 26.04 | Yes | No | No | No | Yes |

Every image uses `linux/amd64`.

The four slim-derived flavors for one Ubuntu version share one package:

```text
ghcr.io/lithoscomputer/ubuntu-24.04:slim
ghcr.io/lithoscomputer/ubuntu-24.04:dind
ghcr.io/lithoscomputer/ubuntu-24.04:chrome
ghcr.io/lithoscomputer/ubuntu-24.04:dind-chrome
```

Full images use separate packages because their source, size, and release schedule differ:

```text
ghcr.io/lithoscomputer/ubuntu-24.04-full:latest
ghcr.io/lithoscomputer/ubuntu-24.04-full:<ImageVersion>
```

Keep the maintained workflow matrix, validation matrix, and README synchronized. Do not create package aliases. GHCR treats every distinct path before the colon as a separate package.

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

The daily workflow builds six images: three slim releases and the three focused Ubuntu 24.04 variants.

Each successful build moves its flavor tag. The workflow then uses `scripts/registry/copy-image.mjs` to create `<flavor>-<12-character-commit>` when that tag does not exist. A scheduled build at the same commit can move the flavor tag but cannot move the existing short-commit tag. Use a digest to pin the exact result of a later scheduled dependency refresh.

After publication, the workflow verifies the mutable flavor tag. Dind and Chrome variants also run `tests/smoke-runtime.sh`.

Publication-only workflow changes do not trigger an image build. Use a manual workflow run after changing tag or package routing. Changes to the Dockerfile, installation scripts, or image runtime tests trigger builds automatically.

## Full image capture

The full workflow runs on the matching GitHub-hosted runner and streams each filesystem layer directly to GHCR. The images are large, so avoid an unnecessary capture.

The capture workflow must remain small. Do not run untrusted code before the capture. The checkout action is the only third-party action allowed before filesystem collection, and the checkout directory is excluded from the image.

The workflow checks the runner `ImageVersion` before capture. Scheduled runs skip an existing version. Changes to `scripts/full/` trigger a capture so changes to the capture implementation receive a new image. A workflow-only routing change requires a manual run and should not force a capture.

See [Full images](full-images.md) for layer and exclusion details.

## Workflows and schedules

| Workflow | Automatic triggers | Purpose |
| --- | --- | --- |
| `validate.yml` | Every pull request and push | Run repository checks and Dockerfile validation |
| `build-slim.yml` | Image-content changes; daily at 05:23 UTC | Build and publish maintained images |
| `build-full.yml` | Capture implementation changes; daily at 08:47 UTC | Check runner versions and capture new full images |

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
  --tag ubuntu-24.04:local-slim \
  --load \
  --file Dockerfile.slim .
```

Replace the target and tag with `dind`, `chrome`, or `dind-chrome` for a focused Ubuntu 24.04 build.

Verify the image:

```bash
docker run --rm \
  --volume "$PWD/tests:/tests:ro" \
  ubuntu-24.04:local-slim \
  /tests/verify-image.sh 24.04 slim
```

Run a Dind smoke test in a privileged container:

```bash
docker run --rm --privileged \
  --volume "$PWD/tests:/tests:ro" \
  ubuntu-24.04:local-dind \
  /tests/smoke-runtime.sh dind
```

Run a Chrome smoke test with additional shared memory:

```bash
docker run --rm --shm-size=1g \
  --volume "$PWD/tests:/tests:ro" \
  ubuntu-24.04:local-chrome \
  /tests/smoke-runtime.sh chrome
```

## Repository validation

Run these checks before pushing a change:

```bash
bash -n scripts/slim/install.sh scripts/dind/install.sh scripts/dind/start-docker scripts/chrome/install.sh scripts/full/capture-layer.sh tests/smoke-runtime.sh tests/verify-image.sh
shellcheck scripts/slim/install.sh scripts/dind/install.sh scripts/dind/start-docker scripts/chrome/install.sh scripts/full/capture-layer.sh tests/smoke-runtime.sh tests/verify-image.sh
node --check scripts/full/registry.mjs
node --check scripts/registry/copy-image.mjs
node tests/registry-upload.mjs
node tests/registry-copy.mjs
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

## Change package or tag routing

Update the workflows, README, and this guide together. Do not publish another package path as an alias. Use a tag in one of the six documented packages.

Use `scripts/registry/copy-image.mjs` when an existing manifest must receive a new tag or move to another package without rebuilding its layers. The command copies the complete OCI graph, including provenance and SBOM manifests, and verifies the target digest.

## GHCR access

Build workflows use `GITHUB_TOKEN` with package write access. The six packages are public and linked to this repository. Public images must remain anonymously readable after every publication change.
