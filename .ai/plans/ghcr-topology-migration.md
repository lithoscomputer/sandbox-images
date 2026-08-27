# GHCR topology migration plan

## Goal

Replace the current 36-package layout with six GHCR packages and nine image tracks. Reuse every retained image without rebuilding it.

The final packages are:

| Package | Mutable tags | Immutable-by-policy tags |
| --- | --- | --- |
| `ubuntu-22.04` | `slim` | `slim-<12-character-commit>` |
| `ubuntu-22.04-full` | `latest` | GitHub runner `ImageVersion` |
| `ubuntu-24.04` | `slim`, `dind`, `chrome`, `dind-chrome` | `<flavor>-<12-character-commit>` |
| `ubuntu-24.04-full` | `latest` | GitHub runner `ImageVersion` |
| `ubuntu-26.04` | `slim` | `slim-<12-character-commit>` |
| `ubuntu-26.04-full` | `latest` | GitHub runner `ImageVersion` |

The non-full packages will not have a `latest` tag. A user must select an available flavor explicitly. Dind, Chrome, and Dind-Chrome are available only for Ubuntu 24.04.

Examples:

```text
ghcr.io/lithoscomputer/ubuntu-24.04:slim
ghcr.io/lithoscomputer/ubuntu-24.04:dind
ghcr.io/lithoscomputer/ubuntu-24.04:chrome
ghcr.io/lithoscomputer/ubuntu-24.04:dind-chrome
ghcr.io/lithoscomputer/ubuntu-24.04:slim-d832b6d5a46e
ghcr.io/lithoscomputer/ubuntu-24.04-full:latest
ghcr.io/lithoscomputer/ubuntu-24.04-full:20260823.283.1
```

All images remain Linux `amd64` images. There are no `gha-` package names and no moving `ubuntu-latest` name.

## Current state

The repository currently publishes one package for every canonical name and alias. This created 36 private packages.

The six final package names already exist:

- `ubuntu-22.04-full`, `ubuntu-24.04-full`, and `ubuntu-26.04-full` contain the correct full images. Keep these packages.
- `ubuntu-22.04`, `ubuntu-24.04`, and `ubuntu-26.04` currently contain full-image aliases. Reuse these packages for the non-full flavor tags, then remove their obsolete full-image versions.

The other 30 packages are obsolete after the cutover.

The registry already contains these reusable images:

- Ubuntu 22.04: slim and full.
- Ubuntu 24.04: slim, Dind, Chrome, Dind-Chrome, and full.
- Ubuntu 26.04: slim and full.

Ubuntu 22.04 and 26.04 intentionally do not include Dind, Chrome, or Dind-Chrome variants.

## Short commit tag policy

A scheduled build can rebuild the same source commit with a newer Ubuntu package snapshot. It must not move an existing short-commit tag.

Use this policy:

- Move the flavor tag on every successful maintained build.
- Publish `<flavor>-<short-commit>` only when that tag does not exist.
- Never overwrite an existing short-commit tag.
- Use the image digest when a user needs an immutable reference to a later scheduled build of the same source commit.
- Keep the snapshot date and resolved tool versions in the OCI metadata even though they are not in the tag.

This makes the short-commit tag immutable by policy. It does not claim that the source commit identifies every scheduled dependency refresh.

## Phase 1: Add a registry-only migration path

Work on a migration branch and open a pull request. Pull-request builds must not push images.

Add a migration command that copies an OCI manifest graph between GHCR repositories. It must:

1. Read the source image index or manifest.
2. Recursively copy child manifests, including BuildKit provenance and SBOM attestations.
3. Mount existing blobs into the target repository on the GHCR server.
4. Publish the source graph under an exact target tag.
5. Confirm the target digest matches the source digest.
6. Refuse to overwrite a target short-commit tag when that tag already exists.

This is a server-side manifest and blob-mount operation. It does not build an image, download its layers, or upload the layers again.

Test the migration command against the local registry test server. The tests must verify OCI behavior, recursive manifest copying, blob mounts, digest preservation, and overwrite refusal. Do not add tests that mirror workflow text or documentation.

## Phase 2: Change future publication

### Maintained images

Update `build-slim.yml`:

1. Keep the current six-image matrix during the topology cutover: slim for all three Ubuntu versions and all four non-full flavors for Ubuntu 24.04.
2. Publish each build to `ghcr.io/lithoscomputer/ubuntu-<version>`.
3. Publish the mutable `<flavor>` tag.
4. Publish `<flavor>-<12-character-commit>` only when it does not already exist.
5. Do not publish `latest`, snapshot tags, `gha-` names, or alias package names.
6. Run the image-contract test for every image.
7. Run the functional Docker and browser smoke tests for every applicable flavor.
8. Keep the daily schedule and the 48-hour-old Ubuntu package snapshot safety rule.

Separate content-change triggers from publication-only workflow changes. The migration commit must not start a maintained-image rebuild merely because tag or package routing changed.

### Full images

Update `build-full.yml` and the full-image publisher:

1. Publish directly to `ghcr.io/lithoscomputer/ubuntu-<version>-full`.
2. Keep `latest` and the GitHub runner `ImageVersion` tag.
3. Remove the reusable full-alias synchronization job.
4. Preserve the current daily runner-version check and skip behavior.
5. Do not force a runner capture for this publication-only change.

### Remove alias implementation

Delete:

- `.github/workflows/sync-full-aliases.yml`
- `scripts/image-aliases.sh`
- `scripts/aliases/registry.mjs`
- `tests/image-aliases.sh`
- `tests/registry-aliases.mjs`

Remove their references from validation workflows and developer documentation.

### Documentation

Update the README so it is again sufficient for image selection:

- Show the six packages and every mutable tag.
- State that non-full pulls require an explicit flavor tag.
- Show the short-commit tag and digest forms.
- Remove all `gha-`, unprefixed-alias, `ubuntu-latest`, snapshot-tag, and private-package instructions.

Update the focused image documents and developer guide with the new publication and update rules.

## Phase 3: Validate the code change without rebuilding images

The pull request must pass:

- ShellCheck and shell syntax checks.
- JavaScript syntax and registry unit tests.
- Dockerfile checks for the current six slim-derived builds.
- Registry migration tests that cover indexes, attestations, and blob mounts.
- Existing image-contract tests against the already published source images.
- Existing Docker and browser runtime smoke tests against the already published source images.
- Zizmor with pedantic rules and no suppressed findings.
- Markdown link checks and `git diff --check`.

Do not delete or make any package public in this phase.

## Phase 4: Shuffle the nine existing images privately

Merge the workflow change only after the pull request checks pass. The merge must not start a maintained-image rebuild or full-image capture.

Use the migration command to copy the current GHCR manifests to these target tags:

```text
gha-ubuntu-22.04-slim:latest       -> ubuntu-22.04:slim
gha-ubuntu-24.04-slim:latest       -> ubuntu-24.04:slim
gha-ubuntu-24.04-dind:latest       -> ubuntu-24.04:dind
gha-ubuntu-24.04-chrome:latest     -> ubuntu-24.04:chrome
gha-ubuntu-24.04-dind-chrome:latest -> ubuntu-24.04:dind-chrome
gha-ubuntu-26.04-slim:latest       -> ubuntu-26.04:slim
```

Copy each source's current `sha-<commit>-snapshot-<date>` manifest to the matching `<flavor>-<commit>` target tag. The current reusable maintained images use source commit `c8a14176b836`.

Do not copy the full images. The three `ubuntu-<version>-full` targets already contain the correct `latest` and runner-version tags.

Verify all six mutable non-full tags, all six new short-commit tags, and all three existing full images before removing anything. Record package names, tag lists, version IDs, and manifest digests in a migration inventory under `.ai/`.

For every tag:

1. Pull the `linux/amd64` manifest.
2. Check the Ubuntu release and image flavor labels.
3. Run the image-contract test.
4. Run the applicable Docker or browser smoke test.
5. Confirm the source tag, short-commit target tag, and mutable flavor target tag resolve to the same digest.

## Phase 5: Remove obsolete versions from the six retained packages

Before each deletion, fetch fresh package and version data from GitHub. Resolve exact numeric version IDs. Do not use globs or inferred IDs.

The current non-full target packages contain these obsolete full-image versions:

| Package | Obsolete tags currently present |
| --- | --- |
| `ubuntu-22.04` | `latest`, `20260817.266.1` |
| `ubuntu-24.04` | `latest`, `20260823.283.1` |
| `ubuntu-26.04` | `latest`, `20260824.116.1` |

For each Ubuntu version:

1. Confirm the same runner-version tag and manifest digest exist in `ubuntu-<version>-full`.
2. Confirm every migrated mutable flavor tag works in `ubuntu-<version>`.
3. Delete only the obsolete full-image version from `ubuntu-<version>`.
4. Confirm that `latest` and the runner-version tag are gone from `ubuntu-<version>`.
5. Confirm that the desired full package is unchanged.

## Phase 6: Delete the 30 obsolete packages

Generate an exact deletion list as the set difference between the current 36 packages and this keep list:

```text
ubuntu-22.04
ubuntu-22.04-full
ubuntu-24.04
ubuntu-24.04-full
ubuntu-26.04
ubuntu-26.04-full
```

Review the deletion list before making changes. Refresh the GitHub CLI token with `delete:packages` only for this cleanup. Delete one exact private package at a time through the GitHub REST API. After each deletion, confirm that all six retained packages still exist.

GitHub permits restoration for 30 days only while the deleted namespace has not been reused. The migration must not publish to any deleted alias name. See [GitHub's package deletion and restoration rules](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package).

## Phase 7: Public release

Package visibility changes are the final irreversible step. GitHub does not expose this operation through the REST or GraphQL API, so use the package settings pages.

For each of the six retained packages:

1. Confirm its repository link points to `lithoscomputer/sandbox-images`.
2. Confirm its description and OCI source metadata.
3. Confirm the exact allowed tag set.
4. Change visibility to public.
5. Test anonymous registry access without local Docker credentials.

Run anonymous pulls for all nine mutable image references:

- Slim for Ubuntu 22.04 and 26.04.
- Slim, Dind, Chrome, and Dind-Chrome for Ubuntu 24.04.
- One full `latest` reference for each of three Ubuntu versions.

Also test at least one short-commit tag per non-full package and one runner-version tag per full package.

## Phase 8: Observe the first scheduled update

Watch the next maintained-image and full-image schedules through completion.

Confirm:

- Only the six retained packages are updated.
- Each non-full flavor tag moves to its new digest.
- Existing short-commit tags do not move.
- No non-full `latest` tag appears.
- Full `latest` and runner-version tags behave as documented.
- Anonymous pulls continue to work.

## Rollback

Before package deletion, rollback is a normal workflow revert and republish.

After deletion, GitHub can restore a private package or package version for up to 30 days only if its namespace and tags have not been reused. The six target namespaces will be reused, so the migration inventory and verified full-package copies are the important recovery points for those names.

After a package becomes public, GitHub does not permit changing it back to private. Public visibility therefore happens only after all cleanup and anonymous-readiness checks pass.

## Unresolved questions

None. This plan assumes a 12-character short commit, Ubuntu 24.04-only Dind and Chrome variants, and the set-once short-commit tag policy described above.
