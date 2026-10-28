# Releasing

Releases are managed through GitHub Actions. Do not manually bump the version
in `appPackage/manifest.json` — the workflow owns that.

## How to release

1. Go to **Actions** → **Release** → **Run workflow**.
2. Enter the target version (e.g. `1.0.1`). Must be a single logical bump
   (patch, minor, or major) from the current version and must not start with `0`.
3. The workflow validates the version, bumps `appPackage/manifest.json`, stamps
   the changelog, and opens a release PR with the `skip-changelog` label.
4. Review and merge the release PR.
5. On merge, the **Tag Release** workflow automatically creates the git tag
   (`v{version}`) and a GitHub Release carrying `elastic-copilot-cowork-{version}.zip`.

## Tag format

Git tags use the `v{version}` format (e.g. `v1.0.1`).

## Versioning

This plugin follows [semver](https://semver.org/):

- **Patch** (`X.Y.Z+1`): bug fixes, docs, CI changes.
- **Minor** (`X.Y+1.0`): new skills synced, new connectors added, non-breaking changes.
- **Major** (`X+1.0.0`): breaking changes to the manifest or connector behavior.

The `manifestVersion` field (Teams schema version, currently `"1.29"`) is separate
from `version` and is not bumped during a release.

## Changelog

The release workflow inserts `## [{version}] - {date}` immediately below the
existing `## [Unreleased]` heading. The `[Unreleased]` heading stays in place;
entries accumulated there since the previous release become the body of the new
versioned section.

## Manual pre-submission checklist

After the GitHub Release is published, the release manager must validate the
package and hand it off for Partner Center submission. Run these steps on your
own machine (requires `atk` CLI and a valid M365 account with access to the test
tenant):

### 1. Download the release asset

```sh
gh release download v{version} -p '*.zip'
```

### 2. Sign in to M365

```sh
atk auth login m365
```

This opens an interactive browser sign-in with MFA. Complete it before proceeding.

### 3. Validate the package

```sh
atk validate --package-file ./elastic-copilot-cowork-{version}.zip
```

Expect output containing `59 passed.` (or "All passed") with no `(×)` lines.

> **Warning:** Do not rely on the exit code alone — it has not been verified to be
> non-zero when a validation rule fails. Inspect the output text directly.

If any rule fails, **do not submit**. Fix the issue, cut a new patch release, and
repeat from step 1.

### 4. Sideload and smoke-test

```sh
atk install
```

Sideload the package to the test tenant and smoke-test at least 3 skills plus the
Elastic Docs connector before proceeding.

### 5. Hand off to Partner Center

Deliver `elastic-copilot-cowork-{version}.zip` to the Partner Center owner
(Greg Crist) for submission.
