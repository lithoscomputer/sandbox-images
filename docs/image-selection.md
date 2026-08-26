# Choosing an image

Start with a slim image. Use a full image only when the workflow depends on software that GitHub preinstalls on its hosted runners.

## Comparison

| | Slim | Full |
| --- | --- | --- |
| Base | Official Ubuntu container image | Filesystem capture of a matching GitHub-hosted runner |
| Best for | Shell, Git, Node.js actions, Python, and native builds | Workflows that assume GitHub runner software is already installed |
| Software set | Small, stable set maintained in this repository | Large GitHub-hosted runner software set |
| Tool versions | Ubuntu snapshot packages and pinned Node.js versions | Versions from the captured GitHub runner image |
| Download and storage | About 1 GiB unpacked for the tested Ubuntu 24.04 build | Tens of GiB after extraction; exact size depends on the runner release |
| GitHub runner parity | Limited | High filesystem parity, with the container limits described below |
| Update source | This repository | GitHub's runner image updates |

Choose slim when all of these statements are true:

- The workflow uses common shell and Git commands.
- JavaScript actions can run with Node.js 20, 22, or 24.
- The workflow uses the system Python, or installs its required Python version.
- The workflow installs any other required runtimes and tools.
- Small downloads and lower storage use are more important than runner parity.

Choose full when one or more of these statements are true:

- The workflow assumes a language, SDK, browser, database, or cloud tool is already installed.
- The workflow uses paths or environment variables from a GitHub-hosted runner.
- Installing large toolchains during each job takes too much time.
- Reproducing the GitHub-hosted runner filesystem is more important than image size.

## Slim contents

Each slim image starts from the matching `ubuntu:<version>` image. The build explicitly installs these Ubuntu packages with `--no-install-recommends`:

| Area | Packages |
| --- | --- |
| Build | `build-essential` |
| Files and archives | `file`, `rsync`, `tar`, `unzip`, `xz-utils`, `zip`, `zstd` |
| Git and SSH | `git`, `git-lfs`, `openssh-client` |
| HTTP and package trust | `apt-transport-https`, `ca-certificates`, `curl`, `gnupg`, `wget` |
| Shell support | `jq`, `locales`, `shellcheck`, `sudo` |
| Python | `python3`, `python3-pip`, `python3-venv`, `pipx` |

Ubuntu installs required dependency packages too. The exact dependency versions differ by Ubuntu release and package snapshot. The package array in [`scripts/slim/install.sh`](../scripts/slim/install.sh) is the source of truth.

The image also contains:

- Node.js 20.20.2, 22.23.2, and 24.19.0 for x86-64.
- `npm`, `npx`, and `corepack` from the default Node.js 24 installation.
- GitHub Actions-compatible Node.js tool-cache paths under `/opt/hostedtoolcache/node` and `/opt/acttoolcache/node`.
- `ImageOS`, `IMAGE_OS`, `LSB_RELEASE`, and tool-cache environment variables.
- Writable `/github`, `/workspace`, `/opt/hostedtoolcache`, and `/opt/acttoolcache` paths.
- A `python` command that points to the system `python3` command.

The Ubuntu packages come from a repository snapshot that is at least 48 hours old when the workflow starts. This rule prevents the build from installing packages that are less than 24 hours old.

## What slim does not provide

Slim does not try to match the complete GitHub-hosted runner. It does not intentionally install these software groups:

- Docker CLI, Docker daemon, Docker Buildx, or Docker Compose.
- Java, Kotlin, Gradle, Maven, or Ant.
- .NET, Mono, or PowerShell.
- Go, Ruby, Rust, Swift, PHP, R, Julia, or Miniconda.
- Android SDK or NDK tools.
- Browsers, browser drivers, or Playwright browser files.
- AWS, Azure, Google Cloud, Kubernetes, Terraform, or other infrastructure tools.
- MySQL, PostgreSQL, Redis, or other database servers and clients.
- GitHub CLI, Homebrew, or the broad GitHub-hosted runner tool cache.
- A GitHub Actions runner process.
- A service manager or virtual-machine services supplied by a GitHub-hosted runner.

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

Try slim first. Run the workflow and note each missing command. If the missing set is small, install those tools in the workflow or in an image derived from slim. If the workflow needs several large preinstalled toolchains or close GitHub runner parity, use full.
