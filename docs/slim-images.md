# Slim images

Slim images are the base for the `slim`, `dind`, `chrome`, and `dind-chrome` flavors. They start from the matching official `ubuntu:<version>` container image and add common tools and GitHub Actions compatibility paths.

The design follows ideas from [`catthehacker/docker_images`](https://github.com/catthehacker/docker_images) and [GitHub's `ubuntu-slim` image](https://github.com/actions/runner-images/tree/main/images/ubuntu-slim). These images are not exact copies of GitHub-hosted runners.

## Installed Ubuntu packages

The build installs these packages with `--no-install-recommends`:

| Area | Packages |
| --- | --- |
| Build | `build-essential` |
| Files and archives | `file`, `rsync`, `tar`, `unzip`, `xz-utils`, `zip`, `zstd` |
| Git and GitHub | `gh`, `git`, `git-lfs` |
| HTTP, networking, and SSH | `apt-transport-https`, `ca-certificates`, `curl`, `gnupg`, `iproute2`, `openssh-client`, `wget` |
| Process and system support | `procps`, `util-linux` |
| Shell support | `jq`, `locales`, `ripgrep`, `shellcheck`, `sudo` |
| Python | `python3`, `python3-jsonschema`, `python3-pip`, `python3-venv`, `pipx` |

Ubuntu installs required dependency packages too. Exact dependency versions differ by Ubuntu release and package snapshot. The package array in [`scripts/slim/install.sh`](../scripts/slim/install.sh) is the source of truth. The GitHub CLI is a pinned upstream release rather than an Ubuntu package.

## Node.js and action compatibility

Slim-based images contain these pinned Node.js versions for x86-64:

- Node.js 20.20.2.
- Node.js 22.23.2.
- Node.js 24.19.0.

The default `node`, `npm`, `npx`, and `corepack` commands use Node.js 24. The complete installations are under `/opt/hostedtoolcache/node`. `/opt/acttoolcache/node` points to the same content.

This layout supports JavaScript actions that select a Node.js runtime from the GitHub Actions tool cache. An action can still require a command that the image does not contain.

The image also provides a `python` command that points to the system `python3` command. Git treats every mounted repository as a safe directory.

## Package freshness

The maintained-image workflow uses an Ubuntu package repository snapshot from 48 hours before the build. This prevents installation of Ubuntu packages released less than 24 hours ago.

Other downloaded tools use reviewed, pinned releases that are also more than 24 hours old.

## What plain slim does not provide

The plain slim images do not intentionally install these software groups:

- Docker. Select `dind` when it is required.
- Chrome, browser drivers, or Playwright browser files. Select `chrome` when the maintained browser stack is suitable.
- Java, Kotlin, Gradle, Maven, or Ant.
- .NET, Mono, or PowerShell.
- Go, Ruby, Rust, Swift, PHP, R, Julia, or Miniconda.
- Android SDK or NDK tools.
- AWS, Azure, Google Cloud, Kubernetes, Terraform, or other infrastructure tools.
- MySQL, PostgreSQL, Redis, or other database servers and clients.
- Homebrew or the broad GitHub-hosted runner tool cache.
- A GitHub Actions runner process.
- Virtual-machine services supplied by a GitHub-hosted runner.

An Ubuntu base package or dependency can add a command that is not in the explicit list. Do not depend on that command without adding it to the maintained package list.

## Measured size and Daytona validation

On 2026-08-27, all four Ubuntu 24.04 slim-based images were tested in Daytona container sandboxes. Each sandbox used 2 vCPU, 4 GiB of memory, and a 10 GB disk.

| Image | Installed filesystem content | Daytona create time | Runtime check |
| --- | ---: | ---: | --- |
| `ubuntu-24.04:slim` | 1,202,847,744 bytes (1.12 GiB) | 0.78 s | Shared commands and environment verified |
| `ubuntu-24.04:dind` | 1,619,832,832 bytes (1.51 GiB) | 0.84 s | Docker 28.3.3 started; an `amd64` scratch image built |
| `ubuntu-24.04:chrome` | 2,431,909,888 bytes (2.26 GiB) | 2.09 s | Chrome opened and closed `about:blank` with `agent-browser` |
| `ubuntu-24.04:dind-chrome` | 2,849,046,528 bytes (2.65 GiB) | 1.14 s | Both Docker and Chrome checks passed |

The filesystem figure is the output of `du -x -s -B1 /`. It includes the read-only image layers. Daytona reported only 20,480 bytes in use on the 10 GB writable overlay before the tests, so `df` does not show the image-layer cost. These measurements are a functional check, not a performance benchmark.

The maintained-image workflow also runs a post-publish runtime smoke test for every Dind and Chrome variant.

## Related documents

- [Image contract](image-contract.md)
- [Docker-in-Docker](docker-in-docker.md)
- [Chrome browser](chrome-browser.md)
