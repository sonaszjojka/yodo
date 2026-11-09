# 0058. Use release-please to pick versions, write the changelog and tag releases

- Status: Accepted
- Date: 2026-11-09

## Context
[0049](0049-releases-semver-tags-publish-the-image.md) has the owner tag by hand and write notes with `gh release create --generate-notes`, and rejected release automation as too heavy for a solo project. With outside contributors and Conventional Commits already enforced on squash titles, a changelog and version bump derived from commits is worth having, and a release should not depend on remembering manual steps.

## Decision
- Use **release-please** (GitHub Action). It keeps a "chore: release X.Y.Z" PR open, built from Conventional Commits since the last release (`fix` patch, `feat` minor, `!` major, per 0049). The PR updates `CHANGELOG.md` and the version in `web/package.json`.
- **Merging that PR** is the release: release-please creates the tag `vX.Y.Z` and the GitHub Release, and the tag runs the image and Pages jobs ([0057](0057-deploy-the-hosted-app-from-release-tags.md)).
- One version for the whole repo (web, server and image ship together).
- The action needs a **fine-grained PAT or GitHub App token**, stored as a repo secret: tags created with `GITHUB_TOKEN` do not trigger other workflows, so the tag-push jobs would never run.
- The guards on the tag (on `main`, highest tag) from 0049 stay. Supersedes the manual tag and Release steps of 0049.

## Alternatives considered
- **Manual tag + `--generate-notes`** (0049) — no new parts, but versions and notes depend on the owner.
- **semantic-release** — releases on every merge, which conflicts with deliberate releases (0057).
- **Changesets** — good for multi-package JS repos; adds a file per PR for contributors.

## Consequences
- Contributors need nothing beyond Conventional Commit PR titles (a title check enforces it).
- The release is reviewable as a PR before it happens; the owner decides when to merge it.
- One more secret to rotate; the token's scope is limited to this repository.
- Commit types other than `feat`/`fix`/`!` do not trigger a release by themselves.
