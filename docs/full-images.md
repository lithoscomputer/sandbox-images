# Full images

Full images are filesystem captures of actual GitHub-hosted Ubuntu runners. Use them when a workflow assumes the broad software set preinstalled by GitHub.

Full images are available for Ubuntu 22.04, 24.04, and 26.04 on AMD64 and ARM64.

## Source environments

Each capture job runs on its matching GitHub runner label:

- AMD64: `ubuntu-22.04`, `ubuntu-24.04`, and `ubuntu-26.04`.
- ARM64: `ubuntu-22.04-arm`, `ubuntu-24.04-arm`, and `ubuntu-26.04-arm`.

The upstream installed-software inventories are:

- [Ubuntu 22.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md)
- [Ubuntu 22.04 ARM64 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Arm64-Readme.md)
- [Ubuntu 24.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
- [Ubuntu 24.04 ARM64 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Arm64-Readme.md)
- [Ubuntu 26.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md)
- [Ubuntu 26.04 ARM64 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Arm64-Readme.md)

Those inventories describe the runner releases that GitHub currently publishes. The installed tools can differ by architecture.

Ubuntu 26.04 is a public-preview GitHub Actions image. Its installed software and runner availability can change more often than the other releases.

## Capture design

The workflow streams the runner filesystem directly to GHCR. It separates the root filesystem, `/usr/local`, `/opt`, and the hosted tool cache into layers. It does not create a second local filesystem copy.

Full does not inherit from slim. A runner capture already contains the complete operating system and tool set. Adding that filesystem over slim would duplicate content and make the image larger.

Full images are tens of GiB after extraction.

## Excluded content

The capture excludes:

- Pseudo-filesystems such as `/dev`, `/proc`, `/sys`, and `/run`.
- Docker state under `/var/lib/docker`.
- Apt caches and package lists.
- Temporary, crash, and swap files.
- The workflow checkout and runner work directories.
- Common SSH, cloud, Docker, cache, and credential locations under the runner home directory.

The capture creates `/github` and `/workspace` when the runner does not provide them. It also creates `/opt/acttoolcache` as a link to `/opt/hostedtoolcache`.

## Container limits

Full provides high filesystem parity, but it is not a virtual machine:

- The host kernel is not captured.
- GitHub-hosted runner services do not automatically start.
- Docker state is not captured.
- Caches and transient workflow files are not captured.
- The runtime must supply mounts, credentials, privileges, networking, and job variables.

A workflow can still need service startup commands or a runtime-specific setup step.

## Updates and tags

The daily workflow checks the `ImageVersion` on each GitHub runner. It skips filesystem capture when the matching architecture-specific version tag already exists in GHCR. A new capture publishes:

- `latest-<architecture>`.
- `<ImageVersion>-<architecture>`.

After both platform jobs finish, the workflow assembles `latest` as a multi-architecture image index. AMD64 and ARM64 runner releases can have different `ImageVersion` values, so version tags remain platform-specific.

Full images publish directly to a package named `ubuntu-<version>-full`. They do not publish package aliases.

See [Image contract](image-contract.md) for the shared process, path, and runtime behavior.
