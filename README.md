# GitHub Actions Ubuntu container images

This repository publishes Linux x86-64 container images based on GitHub Actions Ubuntu environments. Images are stored under `ghcr.io/lithoscomputer/`.

## Choose an image

Start with Ubuntu 24.04 slim:

```text
ghcr.io/lithoscomputer/ubuntu-24.04:slim
```

Select a different image only when the workflow has a specific need:

- Use `dind` to build Docker images or run containerized services.
- Use `chrome` for Chrome, `agent-browser`, or Playwright browser testing.
- Use `dind-chrome` when the workflow needs both Docker and browser testing.
- Use `full` when the workflow assumes the broad software set installed on a GitHub-hosted runner.
- Select Ubuntu 22.04 or 26.04 only when the workflow needs that operating-system version.

| Ubuntu | Flavor | Image reference | Approximate installed content |
| --- | --- | --- | ---: |
| 22.04 | Slim | `ghcr.io/lithoscomputer/ubuntu-22.04:slim` | About 1 GiB |
| 22.04 | Full | `ghcr.io/lithoscomputer/ubuntu-22.04-full:latest` | Tens of GiB |
| 24.04 | Slim | `ghcr.io/lithoscomputer/ubuntu-24.04:slim` | 1.12 GiB |
| 24.04 | Docker-in-Docker | `ghcr.io/lithoscomputer/ubuntu-24.04:dind` | 1.51 GiB |
| 24.04 | Chrome | `ghcr.io/lithoscomputer/ubuntu-24.04:chrome` | 2.26 GiB |
| 24.04 | Docker-in-Docker and Chrome | `ghcr.io/lithoscomputer/ubuntu-24.04:dind-chrome` | 2.65 GiB |
| 24.04 | Full | `ghcr.io/lithoscomputer/ubuntu-24.04-full:latest` | Tens of GiB |
| 26.04 | Slim | `ghcr.io/lithoscomputer/ubuntu-26.04:slim` | About 1 GiB |
| 26.04 | Full | `ghcr.io/lithoscomputer/ubuntu-26.04-full:latest` | Tens of GiB |

All images use `linux/amd64`. This repository does not publish ARM, Windows, or macOS images. Dind and Chrome variants are available only for Ubuntu 24.04.

Ubuntu 26.04 is currently a public-preview GitHub Actions runner image. Its contents and availability can change more often than the other versions.

### What slim means

Every slim-based image includes Git, Git LFS, GitHub CLI, SSH, curl, wget, jq, ripgrep, archive tools, `build-essential`, Python with pip and venv support, and Node.js 20, 22, and 24 tool-cache entries for JavaScript actions.

Plain slim does not include Docker, Chrome, Java, .NET, Go, Ruby, Rust, Android tools, cloud CLIs, Kubernetes tools, Terraform, databases, Homebrew, or the broad GitHub-hosted runner tool cache. Select a focused Dind or Chrome image when it provides the missing capability. Select full when the workflow depends on several other preinstalled toolchains or close GitHub runner filesystem parity.

Full images contain the captured runner filesystem, but they are still containers. They do not include the runner virtual machine, host kernel, transient Docker state, or automatically started services.

## Choose a tag

Non-full packages require an explicit flavor tag. They do not publish `latest`:

```text
ghcr.io/lithoscomputer/ubuntu-24.04:slim
ghcr.io/lithoscomputer/ubuntu-24.04:dind
ghcr.io/lithoscomputer/ubuntu-24.04:chrome
ghcr.io/lithoscomputer/ubuntu-24.04:dind-chrome
```

The flavor tags move after successful maintained builds. Use a flavor and 12-character source commit when the source revision must not move:

```text
ghcr.io/lithoscomputer/ubuntu-24.04:slim-d832b6d5a46e
ghcr.io/lithoscomputer/ubuntu-24.04:dind-d832b6d5a46e
```

A scheduled build can refresh packages without changing the repository commit. The short-commit tag is set once and does not move. Pin the image digest when a workflow must select the exact result of a later scheduled refresh:

```text
ghcr.io/lithoscomputer/ubuntu-24.04@sha256:<digest>
```

Full packages publish:

| Tag | Behavior |
| --- | --- |
| `latest` | Moves after a new GitHub runner filesystem is captured |
| GitHub runner `ImageVersion` | Identifies the captured runner release and does not move |

There is no moving `ubuntu-latest` package or tag. Select an Ubuntu version explicitly.

## Examples

Pull and run slim:

```bash
docker pull ghcr.io/lithoscomputer/ubuntu-24.04:slim
docker run --rm \
  ghcr.io/lithoscomputer/ubuntu-24.04:slim \
  gh --version
```

Start Docker-in-Docker:

```bash
docker run --rm --privileged \
  ghcr.io/lithoscomputer/ubuntu-24.04:dind \
  bash -lc 'start-docker && docker info'
```

Run Chrome with additional shared memory:

```bash
docker run --rm --shm-size=1g \
  ghcr.io/lithoscomputer/ubuntu-24.04:chrome \
  chrome --version
```

Public packages can be pulled anonymously. No GHCR login is required.

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
