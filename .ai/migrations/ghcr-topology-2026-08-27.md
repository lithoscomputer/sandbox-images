# GHCR topology migration inventory

Date: 2026-08-27

Repository merge: `080bcfa95ef83f3fc59bc7a8a52404d817150fa0`

## Retained image digests

The source, mutable target tag, and short-commit target tag resolved to the same digest for every non-full image.

| Target | Digest |
| --- | --- |
| `ubuntu-22.04:slim` | `sha256:1367d6aacb71e456398678b1cb25bfdbe818ea7463992f16a2c5ee9486bda609` |
| `ubuntu-24.04:slim` | `sha256:ad8e14cd0f30bc77be2c48ea2cbb473873a7549144eb755c9c0a43b747ec2cab` |
| `ubuntu-24.04:dind` | `sha256:ee4eb1f59426e910476224fd4550cb17149d37454e1bafcf2d1314963cf106bb` |
| `ubuntu-24.04:chrome` | `sha256:878da939465ca0ad34e792e8dda381ad552d33441aa7ea47d385cd4216c8ff1f` |
| `ubuntu-24.04:dind-chrome` | `sha256:a8d007d1203c99b471ea45b368b208cdc085a3949e4927bb263d401a7cba0027` |
| `ubuntu-26.04:slim` | `sha256:76a15bbe617a21fe03f3b8db5011e1349815e6a0cfbd03f54579255dfa7d8498` |
| `ubuntu-22.04-full:latest` | `sha256:9ebe46e613336ffda6f50d1e9f036895b0ed40b9de62c8c8331883d6fe7a1114` |
| `ubuntu-24.04-full:latest` | `sha256:48a8630df82bd794b4be8f81e2e60490077a0f45c79ae01833399b51ee201974` |
| `ubuntu-26.04-full:latest` | `sha256:e58fa2642c9aa74596515942e978185ebe43329de20661217e42086f4b583b03` |

## Obsolete full versions in retained non-full packages

These full manifests were confirmed to have the same digest as the retained full package before deletion.

| Package | Version ID | Tags |
| --- | ---: | --- |
| `ubuntu-22.04` | `1178402028` | `latest`, `20260817.266.1` |
| `ubuntu-24.04` | `1178402142` | `latest`, `20260823.283.1` |
| `ubuntu-26.04` | `1178401868` | `latest`, `20260824.116.1` |

## Recovery

GitHub permits package and package-version restoration for up to 30 days only when the deleted namespace and tags have not been reused. The retained manifest digests above are the primary recovery references for this migration.

## Deleted packages

The following 30 private packages were deleted after all retained digests were verified:

```text
gha-ubuntu-22.04
gha-ubuntu-22.04-full
gha-ubuntu-22.04-slim
gha-ubuntu-24.04
gha-ubuntu-24.04-chrome
gha-ubuntu-24.04-dind
gha-ubuntu-24.04-dind-chrome
gha-ubuntu-24.04-full
gha-ubuntu-24.04-slim
gha-ubuntu-26.04
gha-ubuntu-26.04-full
gha-ubuntu-26.04-slim
gha-ubuntu-latest
gha-ubuntu-latest-chrome
gha-ubuntu-latest-dind
gha-ubuntu-latest-dind-chrome
gha-ubuntu-latest-full
gha-ubuntu-latest-slim
ubuntu-22.04-slim
ubuntu-24.04-chrome
ubuntu-24.04-dind
ubuntu-24.04-dind-chrome
ubuntu-24.04-slim
ubuntu-26.04-slim
ubuntu-latest
ubuntu-latest-chrome
ubuntu-latest-dind
ubuntu-latest-dind-chrome
ubuntu-latest-full
ubuntu-latest-slim
```

## Public verification

The six retained packages were changed from private to public through GitHub package settings:

```text
ubuntu-22.04
ubuntu-22.04-full
ubuntu-24.04
ubuntu-24.04-full
ubuntu-26.04
ubuntu-26.04-full
```

Anonymous GHCR requests returned each expected manifest and digest. Anonymous requests for `ubuntu-22.04:latest`, `ubuntu-24.04:latest`, and `ubuntu-26.04:latest` returned `404`, as required.
