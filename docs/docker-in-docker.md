# Docker-in-Docker images

The `dind` and `dind-chrome` flavors add a maintained Docker environment to the Ubuntu 24.04 slim image.

## Installed software

The images add:

- Docker Engine and CLI.
- containerd.
- Docker Buildx.
- Docker Compose.
- `fuse-overlayfs`.
- `/usr/local/bin/start-docker`.

See [`Dockerfile.slim`](../Dockerfile.slim) for the pinned versions.

## Start Docker

Docker does not start through the image entrypoint. Run `start-docker` after the container or sandbox starts:

```bash
start-docker
docker info
docker compose version
```

`start-docker` first waits for the runtime provider to start Docker. If Docker is still unavailable, it starts the service itself. It then waits for the daemon to become ready and reports diagnostics on failure. It is safe to call when Docker is already running.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCKER_PROVIDER_WAIT_SECONDS` | `10` | Time to wait for the runtime provider to start Docker |
| `DOCKER_START_WAIT_SECONDS` | `30` | Time to wait after starting the Docker service |
| `DOCKER_DIAGNOSTIC_LOG` | `/tmp/docker-start.log` | Failure diagnostic output; set it to an empty value to disable the file |
| `DOCKER_LOG_PATH` | `/var/log/docker.log` | Docker daemon log read during failure diagnosis |

## Container privileges

Docker-in-Docker needs the capabilities supplied by a privileged container or a compatible sandbox provider.

Direct Docker example:

```bash
docker run --rm -it --privileged \
  ghcr.io/lithoscomputer/ubuntu-24.04:dind
```

Then start the daemon and run a container:

```bash
start-docker
docker run --rm hello-world
```

The image does not mount the host Docker socket. A runtime can choose socket mounting instead, but that gives the container control of the host Docker daemon and is a different security model.

## Daytona

Use at least 2 vCPU and 4 GiB of memory for a Daytona Docker-in-Docker sandbox. Create the snapshot from an immutable image tag or digest. Daytona rejects the `latest` tag during snapshot creation.

After the sandbox starts:

```bash
start-docker
docker info
```

The GHCR packages are public and can be pulled without registry credentials. The 2026-08-27 validation used `daytona snapshot push` with locally built images because the packages were still private at that time.

## Automated validation

After publishing a `dind` image, GitHub Actions runs a runtime smoke test in a privileged container. The test runs `start-docker` and builds a local `amd64` image from `scratch`. The `dind-chrome` flavor runs the same Docker check before its browser check.

See [Slim images](slim-images.md#measured-size-and-daytona-validation) for measured filesystem sizes and Daytona startup times.
