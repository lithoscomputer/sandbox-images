# GitHub Actions Ubuntu container images

This repository publishes Linux x86-64 container images based on GitHub Actions Ubuntu environments. Images are stored under `ghcr.io/lithoscomputer/`.

## Choose an image

Start with `ubuntu-24.04-slim`. Select a different image only when the workflow has a specific need:

- Use `dind` to build Docker images or run containerized services.
- Use `chrome` for Chrome, `agent-browser`, or Playwright browser testing.
- Use `dind-chrome` when the workflow needs both Docker and browser testing.
- Use `full` when the workflow assumes the broad software set installed on a GitHub-hosted runner.
- Select Ubuntu 22.04 or 26.04 only when the workflow needs that operating-system version.

| Image name | Use it for | Approximate installed content |
| --- | --- | ---: |
| `ubuntu-22.04-slim` | Common command-line, Node.js action, Python, and native build work on Ubuntu 22.04 | About 1 GiB |
| `ubuntu-24.04-slim` | Common command-line, Node.js action, Python, and native build work on Ubuntu 24.04 | 1.12 GiB |
| `ubuntu-24.04-dind` | Docker builds and containerized services | 1.51 GiB |
| `ubuntu-24.04-chrome` | Chrome, `agent-browser`, Playwright MCP, screenshots, and recordings | 2.26 GiB |
| `ubuntu-24.04-dind-chrome` | Docker and browser testing in the same environment | 2.65 GiB |
| `ubuntu-26.04-slim` | Common work that specifically needs Ubuntu 26.04 | About 1 GiB |
| `ubuntu-22.04` | Broad GitHub-hosted runner software on Ubuntu 22.04 | Tens of GiB |
| `ubuntu-24.04` | Broad GitHub-hosted runner software on Ubuntu 24.04 | Tens of GiB |
| `ubuntu-26.04` | Broad GitHub-hosted runner software on Ubuntu 26.04 | Tens of GiB |

All images use `linux/amd64`. This repository does not publish ARM, Windows, or macOS images. The Dind and Chrome variants are available only for Ubuntu 24.04.

Ubuntu 26.04 is currently a public-preview GitHub Actions runner image. Its contents and availability can change more often than the other versions.

### What slim means

Every slim-based image includes Git, Git LFS, GitHub CLI, SSH, curl, wget, jq, ripgrep, archive tools, `build-essential`, Python with pip and venv support, and Node.js 20, 22, and 24 tool-cache entries for JavaScript actions.

Plain slim does not include Docker, Chrome, Java, .NET, Go, Ruby, Rust, Android tools, cloud CLIs, Kubernetes tools, Terraform, databases, Homebrew, or the broad GitHub-hosted runner tool cache. Select a focused Dind or Chrome image when it provides the missing capability. Select full when the workflow depends on several other preinstalled toolchains or close GitHub runner filesystem parity.

Full images contain the captured runner filesystem, but they are still containers. They do not include the runner virtual machine, host kernel, transient Docker state, or automatically started services.

## Image names and aliases

Use an image as:

```text
ghcr.io/lithoscomputer/<image-name>:<tag>
```

The `gha-` prefix is optional. For example, both names below select the same package content:

```text
ghcr.io/lithoscomputer/ubuntu-24.04-slim:<tag>
ghcr.io/lithoscomputer/gha-ubuntu-24.04-slim:<tag>
```

An image name without a flavor selects `full`. Explicit Ubuntu versions do not move.

### Version-specific aliases

| Alias | Canonical image |
| --- | --- |
| `ubuntu-22.04` | `gha-ubuntu-22.04-full` |
| `ubuntu-22.04-full` | `gha-ubuntu-22.04-full` |
| `ubuntu-22.04-slim` | `gha-ubuntu-22.04-slim` |
| `ubuntu-24.04` | `gha-ubuntu-24.04-full` |
| `ubuntu-24.04-full` | `gha-ubuntu-24.04-full` |
| `ubuntu-24.04-slim` | `gha-ubuntu-24.04-slim` |
| `ubuntu-24.04-dind` | `gha-ubuntu-24.04-dind` |
| `ubuntu-24.04-chrome` | `gha-ubuntu-24.04-chrome` |
| `ubuntu-24.04-dind-chrome` | `gha-ubuntu-24.04-dind-chrome` |
| `ubuntu-26.04` | `gha-ubuntu-26.04-full` |
| `ubuntu-26.04-full` | `gha-ubuntu-26.04-full` |
| `ubuntu-26.04-slim` | `gha-ubuntu-26.04-slim` |

The corresponding names with the `gha-` prefix also work. This includes the full aliases without a flavor: `gha-ubuntu-22.04`, `gha-ubuntu-24.04`, and `gha-ubuntu-26.04`.

### Moving aliases

The `ubuntu-latest` family currently selects Ubuntu 24.04.

| Alias | Canonical image |
| --- | --- |
| `ubuntu-latest` | `gha-ubuntu-24.04-full` |
| `ubuntu-latest-full` | `gha-ubuntu-24.04-full` |
| `ubuntu-latest-slim` | `gha-ubuntu-24.04-slim` |
| `ubuntu-latest-dind` | `gha-ubuntu-24.04-dind` |
| `ubuntu-latest-chrome` | `gha-ubuntu-24.04-chrome` |
| `ubuntu-latest-dind-chrome` | `gha-ubuntu-24.04-dind-chrome` |

Each moving alias also works with the `gha-` prefix. The repository will move the `ubuntu-latest` family only through a deliberate mapping change.

## Choose a tag

Use `latest` when the workflow should receive image updates automatically. Use an immutable tag when a workflow must remain reproducible.

Slim, Dind, and Chrome images publish:

| Tag | Behavior |
| --- | --- |
| `latest` | Moves after each maintained build |
| `snapshot-<YYYYMMDD>` | Identifies the Ubuntu package snapshot date |
| `sha-<12-character-commit>-snapshot-<YYYYMMDD>` | Immutable source commit and package snapshot |

Full images publish:

| Tag | Behavior |
| --- | --- |
| `latest` | Moves after a new GitHub runner filesystem is captured |
| GitHub runner `ImageVersion` | Identifies the captured runner release |

Aliases receive the same tags and reference the same image content as their canonical packages.

## Examples

Pull the recommended slim image:

```bash
docker pull ghcr.io/lithoscomputer/ubuntu-24.04-slim:latest
```

Run a command:

```bash
docker run --rm \
  ghcr.io/lithoscomputer/ubuntu-24.04-slim:latest \
  gh --version
```

Pin a maintained image:

```text
ghcr.io/lithoscomputer/ubuntu-24.04-dind:sha-<commit>-snapshot-<YYYYMMDD>
```

The packages are private until their visibility is changed. Authenticate with a token that has package read access before pulling them:

```bash
docker login ghcr.io
```

## Technical reference

- [Image contract](docs/image-contract.md): platform, process defaults, environment variables, paths, and runtime responsibilities.
- [Slim images](docs/slim-images.md): installed packages, Node.js tool cache, omissions, sizes, and test results.
- [Docker-in-Docker](docs/docker-in-docker.md): Docker contents, `start-docker`, privileges, and Daytona usage.
- [Chrome browser](docs/chrome-browser.md): Chrome, `agent-browser`, Playwright MCP, FFmpeg, and browser environment variables.
- [Full images](docs/full-images.md): runner capture contents, limits, and upstream software inventories.
- [Development](docs/development.md): repository layout, workflows, local builds, validation, and release maintenance.

## License

This project is available under the [MIT License](LICENSE.md).

## Acknowledgement

The slim-image design and GitHub Actions compatibility approach draw on [catthehacker/docker_images](https://github.com/catthehacker/docker_images). Thank you to its maintainers and contributors for making their work available.
