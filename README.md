# GitHub Actions Ubuntu container images

This repository publishes Linux container images based on GitHub Actions Ubuntu environments. Images are stored under `ghcr.io/lithoscomputer/`.

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

The `slim`, `dind`, and `full` tags support both `linux/amd64` and `linux/arm64`. Docker selects the matching image from each multi-architecture tag. The `chrome` and `dind-chrome` tags support only `linux/amd64` because Chrome for Testing does not publish a Linux ARM64 binary. Dind and Chrome variants are available only for Ubuntu 24.04. This repository does not publish Windows or macOS images.

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

The immutable tag has the same platform set as its flavor tag.

A scheduled build can refresh packages without changing the repository commit. The short-commit tag is set once and does not move. Pin the image digest when a workflow must select the exact result of a later scheduled refresh:

```text
ghcr.io/lithoscomputer/ubuntu-24.04@sha256:<digest>
```

Full packages publish:

| Tag | Behavior |
| --- | --- |
| `latest` | Multi-architecture tag that moves after both runner filesystems are ready |
| `latest-amd64`, `latest-arm64` | Moving platform-specific capture tags used to assemble `latest` |
| `<ImageVersion>-amd64`, `<ImageVersion>-arm64` | Immutable platform-specific GitHub runner releases |

AMD64 and ARM64 GitHub runners can have different `ImageVersion` values. Pin the multi-architecture `latest` tag by digest when one immutable reference must work on both platforms.

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
