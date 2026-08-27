# Image contract

This document describes the behavior shared by the published images. See the image-family documents for installed software and family-specific commands.

## Platform

All images use:

- Operating system: Linux.
- Architecture: `amd64` (`x86-64`).
- Container user: root.

The repository does not publish ARM, Windows, or macOS images.

## Process defaults

Every image uses:

```dockerfile
WORKDIR /workspace
CMD ["bash"]
```

The images have no custom `ENTRYPOINT`. A command supplied by the caller runs normally:

```bash
docker run --rm \
  ghcr.io/lithoscomputer/ubuntu-24.04:slim \
  gh --version
```

Running an image without a command starts Bash:

```bash
docker run --rm -it \
  ghcr.io/lithoscomputer/ubuntu-24.04:slim
```

The Dind images do not start Docker through an entrypoint. Run `start-docker` after the container or sandbox starts. See [Docker-in-Docker](docker-in-docker.md).

## Common paths

These paths are part of the image contract:

| Path | Purpose |
| --- | --- |
| `/workspace` | Default working directory |
| `/github` | GitHub Actions compatibility and runtime mounts |
| `/opt/hostedtoolcache` | GitHub Actions-compatible tool cache |
| `/opt/acttoolcache` | `act`-compatible tool-cache path |

Slim-based images create these paths and make them writable by all users. Full captures also ensure that `/workspace` and `/github` exist. The full image preserves the tool-cache permissions from its GitHub-hosted runner source.

The caller remains responsible for mounting source code, credentials, sockets, and persistent storage.

## Locale

Slim-based images set:

```text
LANG=C.UTF-8
```

They do not set `LC_ALL`. Callers can override an individual locale category or set `LC_ALL` for a specific workload.

Full images preserve the values from the captured runner's `/etc/environment`.

## GitHub Actions compatibility variables

Slim-based images set these variables:

| Variable | Ubuntu 22.04 | Ubuntu 24.04 | Ubuntu 26.04 |
| --- | --- | --- | --- |
| `ImageOS` | `ubuntu22` | `ubuntu24` | `ubuntu26` |
| `IMAGE_OS` | `ubuntu22` | `ubuntu24` | `ubuntu26` |
| `AGENT_TOOLSDIRECTORY` | `/opt/hostedtoolcache` | `/opt/hostedtoolcache` | `/opt/hostedtoolcache` |
| `RUNNER_TOOL_CACHE` | `/opt/hostedtoolcache` | `/opt/hostedtoolcache` | `/opt/hostedtoolcache` |
| `RUN_TOOL_CACHE` | `/opt/hostedtoolcache` | `/opt/hostedtoolcache` | `/opt/hostedtoolcache` |
| `ACT_TOOLSDIRECTORY` | `/opt/acttoolcache` | `/opt/acttoolcache` | `/opt/acttoolcache` |

They also write these values to `/etc/environment`. Full images preserve the captured runner environment and add `ACT_TOOLSDIRECTORY=/opt/acttoolcache`.

## Variables supplied by the runtime

The images do not set job-specific state. GitHub Actions, `act`, Fabro, Daytona, or another runtime must supply values such as:

- `CI`.
- `GITHUB_*` variables.
- Repository and package credentials.
- Workspace and tool-cache mounts.
- Docker socket or container privileges.
- Browser namespace, session, display, and port choices.

Do not store runtime credentials in a derived image.

## Services and the host kernel

An image contains a filesystem, not a virtual machine. The host supplies the kernel, cgroups, networking, mounts, and container capabilities. Services installed in an image do not start automatically unless the runtime starts them.

This distinction is especially important for Docker-in-Docker and for services captured in a full image.
