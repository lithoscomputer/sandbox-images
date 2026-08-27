# Choosing an image

Start with a slim image. Use a focused Ubuntu 24.04 variant when the workflow needs Docker, browser testing, or both. Use a full image only when the workflow depends on the broad software set that GitHub preinstalls on its hosted runners.

## Images

| Image | Best for | Approximate unpacked size |
| --- | --- | ---: |
| `gha-ubuntu-22.04-slim` | Common shell, Git, Node.js action, Python, and native build work on Ubuntu 22.04 | About 1 GiB |
| `gha-ubuntu-24.04-slim` | Common shell, Git, Node.js action, Python, and native build work on Ubuntu 24.04 | About 1.1 GB |
| `gha-ubuntu-24.04-dind` | Slim workflows that build images or run containerized services | About 1.6 GB |
| `gha-ubuntu-24.04-chrome` | Slim workflows that use Chrome, `agent-browser`, Playwright MCP, screenshots, or recordings | About 2.3 GB |
| `gha-ubuntu-24.04-dind-chrome` | Workflows that need both containerized services and browser testing | About 2.8 GB |
| `gha-ubuntu-26.04-slim` | Common work that specifically needs Ubuntu 26.04 | About 1 GiB |
| `gha-ubuntu-<version>-full` | Workflows that assume the broad GitHub-hosted runner software set | Tens of GiB |

Sizes are estimates from an Ubuntu 24.04 x86-64 build. Package updates can change them.

All images use `linux/amd64`. The focused Dind and Chrome variants are available only for Ubuntu 24.04.

## Image aliases

Use image names below the `ghcr.io/lithoscomputer/` namespace. The `gha-` prefix is optional. Omitting the flavor selects `full`.

Version-specific aliases are:

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

The corresponding `gha-` aliases without a flavor also select full: `gha-ubuntu-22.04`, `gha-ubuntu-24.04`, and `gha-ubuntu-26.04`.

Moving aliases currently select Ubuntu 24.04:

| Alias | Canonical image |
| --- | --- |
| `ubuntu-latest` | `gha-ubuntu-24.04-full` |
| `ubuntu-latest-full` | `gha-ubuntu-24.04-full` |
| `ubuntu-latest-slim` | `gha-ubuntu-24.04-slim` |
| `ubuntu-latest-dind` | `gha-ubuntu-24.04-dind` |
| `ubuntu-latest-chrome` | `gha-ubuntu-24.04-chrome` |
| `ubuntu-latest-dind-chrome` | `gha-ubuntu-24.04-dind-chrome` |

Each moving alias also works with the `gha-` prefix. For example, `gha-ubuntu-latest` selects full and `gha-ubuntu-latest-chrome` selects Chrome.

Explicit Ubuntu versions do not move. The repository will move the `ubuntu-latest` family only through a deliberate mapping change. Dind and Chrome aliases do not exist for Ubuntu 22.04 or 26.04.

Alias packages receive the same tags and reference the same image manifest as the canonical package. Maintained aliases receive `latest`, `snapshot-<YYYYMMDD>`, and immutable commit-and-snapshot tags. Full aliases receive `latest` and the GitHub runner `ImageVersion` tag.

## Shared slim contents

Every slim-based image starts from the matching `ubuntu:<version>` image. The build explicitly installs these Ubuntu packages with `--no-install-recommends`:

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

The image also contains:

- Node.js 20.20.2, 22.23.2, and 24.19.0 for x86-64.
- `npm`, `npx`, and `corepack` from the default Node.js 24 installation.
- GitHub Actions-compatible Node.js tool-cache paths under `/opt/hostedtoolcache/node` and `/opt/acttoolcache/node`.
- Writable `/github`, `/workspace`, `/opt/hostedtoolcache`, and `/opt/acttoolcache` paths.
- A `python` command that points to the system `python3` command.

The Ubuntu packages come from a repository snapshot that is at least 48 hours old when the workflow starts. This prevents the build from installing packages that are less than 24 hours old. Other downloaded tools use reviewed, pinned releases that are also more than 24 hours old.

## Shared runtime contract

Every maintained slim-based image uses:

```dockerfile
WORKDIR /workspace
CMD ["bash"]
```

The images have no custom `ENTRYPOINT`. A supplied command therefore runs normally:

```bash
docker run --rm ghcr.io/lithoscomputer/gha-ubuntu-24.04-slim:<tag> gh --version
docker run --rm -it ghcr.io/lithoscomputer/gha-ubuntu-24.04-slim:<tag>
```

Every image sets `LANG=C.UTF-8`. It does not set `LC_ALL`, so callers can override individual locale categories.

The images also set these GitHub Actions compatibility variables:

| Variable | Value on Ubuntu 24.04 |
| --- | --- |
| `ImageOS` | `ubuntu24` |
| `IMAGE_OS` | `ubuntu24` |
| `AGENT_TOOLSDIRECTORY` | `/opt/hostedtoolcache` |
| `RUNNER_TOOL_CACHE` | `/opt/hostedtoolcache` |
| `RUN_TOOL_CACHE` | `/opt/hostedtoolcache` |
| `ACT_TOOLSDIRECTORY` | `/opt/acttoolcache` |

The operating-system suffix changes for Ubuntu 22.04 and 26.04. Runtime systems such as GitHub Actions, `act`, Fabro, or Daytona remain responsible for job-specific variables such as `CI`, `GITHUB_*`, credentials, and workspace mounts.

## Dind

The `dind` and `dind-chrome` images add:

- Docker Engine and CLI.
- containerd.
- Docker Buildx.
- Docker Compose.
- `fuse-overlayfs`.
- `/usr/local/bin/start-docker`.

Docker does not start through the image entrypoint. Run `start-docker` after the sandbox starts. The command is safe to call when Docker is already running, waits for the daemon to become ready, and records diagnostics on failure.

```bash
start-docker
docker info
docker compose version
```

The command uses these settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCKER_PROVIDER_WAIT_SECONDS` | `10` | Time to wait for a sandbox provider to start Docker |
| `DOCKER_START_WAIT_SECONDS` | `30` | Time to wait after starting the Docker service |
| `DOCKER_DIAGNOSTIC_LOG` | `/tmp/docker-start.log` | Failure diagnostic output; set it to an empty value to disable the file |
| `DOCKER_LOG_PATH` | `/var/log/docker.log` | Docker daemon log read during failure diagnosis |

Docker-in-Docker needs the capabilities supplied by a privileged container or a compatible sandbox provider. A direct Docker example is:

```bash
docker run --rm -it --privileged \
  ghcr.io/lithoscomputer/gha-ubuntu-24.04-dind:<tag>
start-docker
docker run --rm hello-world
```

Daytona recommends at least 2 vCPU and 4 GiB of memory for Docker-in-Docker sandboxes. Create a Daytona snapshot from an immutable image tag or digest, then run `start-docker` in the sandbox.

### Daytona validation

On 2026-08-27, all four Ubuntu 24.04 slim-based images were tested in Daytona container sandboxes. Each sandbox used 2 vCPU, 4 GiB of memory, and a 10 GB disk. Daytona started the sandboxes from prepared snapshots in 0.8 to 2.1 seconds.

The maintained-image workflow also runs a post-publish runtime smoke test for every Dind and Chrome variant.

| Image | Installed filesystem content | Daytona create time | Runtime check |
| --- | ---: | ---: | --- |
| `gha-ubuntu-24.04-slim` | 1,202,847,744 bytes (1.12 GiB) | 0.78 s | Shared commands and environment verified |
| `gha-ubuntu-24.04-dind` | 1,619,832,832 bytes (1.51 GiB) | 0.84 s | Docker 28.3.3 started; an `amd64` scratch image built |
| `gha-ubuntu-24.04-chrome` | 2,431,909,888 bytes (2.26 GiB) | 2.09 s | Chrome opened and closed `about:blank` with `agent-browser` |
| `gha-ubuntu-24.04-dind-chrome` | 2,849,046,528 bytes (2.65 GiB) | 1.14 s | Both Docker and Chrome checks passed |

The filesystem figure is the output of `du -x -s -B1 /`. It includes the read-only image layers. Daytona reported only 20,480 bytes in use on the 10 GB writable overlay before the tests, so `df` does not show the image-layer cost. These measurements are a functional check, not a performance benchmark.

Daytona snapshot creation requires an immutable image tag. It rejects `latest`. These GHCR packages are private, so Daytona also needs registry credentials with package read access. The 2026-08-27 test used `daytona snapshot push` with locally built images because direct private GHCR import was not authorized by the available Daytona credentials. Preparing the four uploaded snapshots took 36.6 to 52.1 seconds after their layers were cached.

## Chrome

The `chrome` and `dind-chrome` images add:

- Chrome for Testing.
- `agent-browser`.
- Playwright MCP.
- FFmpeg and FFprobe.
- Browser libraries and a stable font set for screenshots and recordings.

Chrome is available through all of these command names:

```text
/usr/local/bin/chrome
/usr/local/bin/google-chrome
/usr/local/bin/google-chrome-stable
```

The original installation is under `/opt/chrome-for-testing`.

Chrome images set:

| Variable | Value |
| --- | --- |
| `CHROME_BIN` | `/usr/local/bin/chrome` |
| `AGENT_BROWSER_ENGINE` | `chrome` |
| `AGENT_BROWSER_EXECUTABLE_PATH` | `/usr/local/bin/chrome` |
| `AGENT_BROWSER_CONTENT_BOUNDARIES` | `1` |
| `AGENT_BROWSER_MAX_OUTPUT` | `50000` |

They do not set a browser namespace, session, extra Chrome arguments, display, or fixed port. The workflow controls those choices.

Start a headless browser with `agent-browser`:

```bash
agent-browser open about:blank
agent-browser get cdp-url
```

Playwright MCP can attach to that browser through its Chrome DevTools Protocol endpoint:

```bash
cdp_url="$(agent-browser get cdp-url)"
playwright-mcp \
  --host 127.0.0.1 \
  --port 3100 \
  --cdp-endpoint "$cdp_url"
```

The image does not set `PLAYWRIGHT_BROWSERS_PATH` and does not download a second Playwright-managed Chromium build. Projects can still install their own Playwright browsers when they need a different browser version.

## What slim does not provide

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

An Ubuntu base package or dependency can add a command that is not in the explicit list. Do not depend on such a command without adding it to the maintained package list.

JavaScript actions can use the included Node.js tool-cache entries. This does not mean that all actions work in slim. An action can still require a command that slim does not contain.

## Full contents and limits

Full images capture the installed filesystem from these GitHub-hosted runners:

- [Ubuntu 22.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md)
- [Ubuntu 24.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
- [Ubuntu 26.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md)

Those upstream inventories describe the runner release that GitHub currently publishes. Use the full image's version tag to identify the captured `ImageVersion`.

Full provides high filesystem parity, but it is not a virtual machine. The capture excludes pseudo-filesystems, Docker state, caches, transient workflow files, and common credential locations. The host kernel is not captured. Services that run on a GitHub-hosted virtual machine do not automatically run in the container. A workflow can still need extra mounts, environment variables, privileges, or service startup steps.

Ubuntu 26.04 is a public-preview GitHub Actions image. Its installed software and runner availability can change more often than the other releases.

## If unsure

Try slim first. Select Dind or Chrome only for the capability the workflow needs. If the workflow needs several other large preinstalled toolchains or close GitHub runner parity, use full.
