# GitHub Actions Ubuntu container images

This repository builds Linux x86-64 container images based on GitHub Actions Ubuntu environments.

## Images

Each image is a separate GHCR package under this repository owner.

| Ubuntu | Slim | Dind | Chrome | Dind + Chrome | Full |
| --- | --- | --- | --- | --- | --- |
| 22.04 | `gha-ubuntu-22.04-slim` | — | — | — | `gha-ubuntu-22.04-full` |
| 24.04 | `gha-ubuntu-24.04-slim` | `gha-ubuntu-24.04-dind` | `gha-ubuntu-24.04-chrome` | `gha-ubuntu-24.04-dind-chrome` | `gha-ubuntu-24.04-full` |
| 26.04 | `gha-ubuntu-26.04-slim` | — | — | — | `gha-ubuntu-26.04-full` |

All images use `linux/amd64`. This repository does not build ARM, Windows, or macOS images.

Ubuntu 26.04 is currently a public-preview GitHub Actions runner image. Its contents and availability can change more often than the other versions.

See [Choosing an image](docs/image-selection.md) for the slim package list, major omissions, and full-image software inventories.

## Slim images

Slim images start from the matching official Ubuntu container image. They include common command-line tools and compatibility paths used by GitHub Actions. The design follows ideas from:

- [`catthehacker/docker_images`](https://github.com/catthehacker/docker_images)
- [GitHub's `ubuntu-slim` image](https://github.com/actions/runner-images/tree/main/images/ubuntu-slim)

The slim images are intentionally not exact copies of GitHub-hosted runners.

They include pinned Node.js 20, 22, and 24 tool-cache entries for JavaScript actions. The default `node` command uses Node.js 24.

Use slim for workflows that install their own language runtimes and tools. Use full when a workflow depends on software that GitHub preinstalls on a hosted runner. See [Choosing an image](docs/image-selection.md) for details.

Ubuntu 24.04 also has focused variants:

- Dind adds Docker Engine, Buildx, Compose, containerd, and a `start-docker` command.
- Chrome adds Chrome for Testing, `agent-browser`, Playwright MCP, FFmpeg, and browser fonts and libraries.
- Dind + Chrome contains both focused tool sets.

The build uses an Ubuntu package repository snapshot from 48 hours before the build. This prevents installation of packages released less than 24 hours ago.

## Full images

Full images are filesystem captures of actual GitHub-hosted runners. Each capture job runs on its matching runner label:

- `ubuntu-22.04`
- `ubuntu-24.04`
- `ubuntu-26.04`

The workflow streams the filesystem directly to GHCR. It does not create a second local copy. This matters because a full runner filesystem is tens of gigabytes after extraction.

Full does not inherit from slim. A runner capture already contains the complete operating system and tool set. Adding that filesystem over slim would duplicate content and make the image larger.

The capture excludes pseudo-filesystems, Docker state, transient files, the workflow checkout, and common credential locations. Keep the capture workflow small. Do not run untrusted steps before the filesystem capture.

## Tags

Maintained builds publish:

- `latest`
- `snapshot-<YYYYMMDD>`
- `sha-<12-character-commit>-snapshot-<YYYYMMDD>`

Full captures publish:

- `latest`
- the GitHub runner `ImageVersion` value

Aliases across Ubuntu versions are intentionally out of scope.

## Updates and workflows

- `build-slim.yml` builds the three slim images and the three Ubuntu 24.04 focused variants each day and when their definitions change. It uses an Ubuntu package snapshot from 48 hours before the build. Manual runs can select a release and flavor. Pull requests build without pushing.
- `build-full.yml` checks all three GitHub runner versions each day. It skips a capture when that `ImageVersion` tag already exists in GHCR. A change to the full-image workflow or scripts forces a new capture. Manual runs can select releases and force a recapture. Capture jobs run one at a time because each upload is large.
- `validate.yml` checks scripts and Dockerfile structure.

The daily schedules use off-peak minutes because GitHub can delay scheduled workflows during high load. GitHub normally updates runner images weekly, and its deployment can take two to three days. A daily version check catches each release after it reaches the runner pool without uploading an unchanged filesystem each day.

GHCR packages inherit repository access by default. Configure package visibility in GitHub after the first publish if the images must be public.

## Local slim build

Use an Ubuntu package snapshot that is at least 24 hours old:

```bash
docker buildx build \
  --platform linux/amd64 \
  --target slim \
  --build-arg UBUNTU_VERSION=24.04 \
  --build-arg IMAGE_OS=ubuntu24 \
  --build-arg APT_SNAPSHOT=20260824T000000Z \
  --tag gha-ubuntu-24.04-slim:local \
  --load \
  --file Dockerfile.slim .
```

Then verify the image:

```bash
docker run --rm \
  --volume "$PWD/tests:/tests:ro" \
  gha-ubuntu-24.04-slim:local \
  /tests/verify-image.sh 24.04
```

Replace the target and tag with `dind`, `chrome`, or `dind-chrome` to build an Ubuntu 24.04 focused variant. See [Choosing an image](docs/image-selection.md) for environment variables, startup commands, and Docker and Daytona examples.
