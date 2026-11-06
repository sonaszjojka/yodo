# 0049. Releases: a semver tag on `main` publishes the versioned image, `latest` is the newest release and `edge` is `main`

- Status: Accepted
- Date: 2026-11-06

## Context
Roadmap 3.6 ends the MVP with a tagged `v1.0.0` image on GHCR. [0019](0019-docker-image-build-and-publishing.md) publishes `latest` and `sha-<short>` from every merge to `main` and defers version tags to the first release. The README quick start uses the untagged image name, so what `latest` means is what a new self-hoster runs. A release also needs a rule for what may be tagged, because the tag is what publishes.

## Decision
- **Versions** follow semver, written `vMAJOR.MINOR.PATCH`. The MVP is `v1.0.0`. Conventional Commits ([conventions](../conventions.md)) say what a release contains: `fix` is a patch, `feat` a minor, `!` / `BREAKING CHANGE` a major. A breaking change to the document format (ADR 0013) is a major.
- **Trigger:** `ci.yml` also runs on a pushed tag matching `v[0-9]+.[0-9]+.[0-9]+`. Prerelease tags such as `v1.0.0-rc1` do not match and publish nothing.
- **Tags on the image:**
  - a release tag pushes `X.Y.Z`, `X.Y` and `sha-<short>`, and moves `latest`;
  - a merge to `main` pushes `edge` and `sha-<short>`, and no longer moves `latest`.
  So `latest` is the newest release and `edge` is the head of `main`.
- **Guards**, checked by the `docker` job before it builds, on tag pushes only: the tagged commit must be reachable from `origin/main`, and the tag must be the highest release tag. The second rule means a late tag on an old commit, or a rerun of an old tag's workflow, fails instead of moving `latest` backwards.
- **On a tag push** only the `docker` job (and the `ci` gate) runs. The tagged commit is on `main` and passed the full workflow when it merged, so the `changes` job and the test jobs are skipped.
- **Releasing is the owner's act**, after the merge: tag `main` with an annotated tag, push the tag, create the GitHub Release from it, and make the GHCR package public once. The steps are in `docs/conventions.md`.
- Supersedes the Publishing bullet of 0019 (which pushed `latest` from `main`); the rest of 0019 (embedding, distroless base, multi-arch) stands.

## Alternatives considered
- **`latest` keeps following `main`, versions only on tags** — no change to 0019, but `docker run ghcr.io/sonaszjojka/yodo` could run an unreleased commit, and "latest" would not mean "the newest release", as people expect.
- **`latest` only on tags and no moving tag for `main`** — simplest, but there is then no way to try the head of `main`, which is what 0019 gave us.
- **Highest-version rule through `docker/metadata-action` alone** — it creates `latest` per event and does not look at other tags, so it cannot refuse an out-of-order tag. The explicit check can.
- **Release automation (release-please, semantic-release)** — would pick the version and write notes from commits, but adds a bot, PRs and a token to a solo project that cuts a release rarely. Revisit if releases become frequent.

## Consequences
- `latest` is not available until the first tag is pushed; the README pins `:1.0.0` and explains `latest` and `edge`.
- A hotfix for an older line (`v1.0.1` after `v1.1.0`) is refused by the highest-tag guard. That is intended for now; supporting maintained old lines needs a new decision.
- The tag guard and tag filters can only be exercised by a real tag push. The first release is therefore the test of this workflow, and task 3.6 is not complete until `docker pull ghcr.io/sonaszjojka/yodo:1.0.0` works.
- GHCR makes a new package private on first push; the owner makes it public once (see 0019).
