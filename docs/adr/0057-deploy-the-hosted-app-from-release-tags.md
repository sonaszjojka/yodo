# 0057. Deploy the hosted app from release tags; `main` is an integration branch

- Status: Accepted
- Date: 2026-11-09

## Context
Yodo is open source and will take outside contributions. Today every merge to `main` redeploys the hosted app on GitHub Pages ([0018](0018-ci-github-actions-gate-job.md)) and pushes the `edge` image ([0049](0049-releases-semver-tags-publish-the-image.md)), so unreleased work reaches hosted users at once, while self-hosters already get only tagged releases. The hosted app and the `latest` image should ship the same thing, and a release should be a deliberate act.

## Decision
- **Branching stays GitHub flow:** short-lived branches (from forks for outside contributors), PRs squash-merged into protected `main`. `main` is the integration branch: always green, not necessarily released.
- **Users get code only from a `vX.Y.Z` tag.** The Pages production deploy runs on a release tag, not on a push to `main`. The tag keeps the guards from 0049 (commit on `main`, highest release tag). On a tag the workflow builds `web/dist` itself, because the test jobs are skipped.
- **Pre-release testing** uses the `edge` image (head of `main`), as before. Pages has one site per repository, so there is no hosted "next" preview.
- The deploy job keeps the `github-pages` Environment, whose deployment-branch policy must allow `v*` tags; deployments are listed there and can later require approval.
- **Hotfixes for an older line:** cut `release/X.Y` from the tag, fix through a PR into that branch, tag from it, and forward-port the fix to `main`. This is documented only; the tag guard ("highest tag") is relaxed in a new ADR when the first such release is needed.
- Supersedes the "deploys on merge to `main`" part of 0018; the rest of 0018 and 0049 stand except where [0058](0058-release-please-for-versions-and-changelog.md) replaces the manual tagging steps.

## Alternatives considered
- **`develop` + `main` (Gitflow-lite)** — a real staging branch, but two long-lived branches, double protection rules, merge-commit noise and release PRs that duplicate what tags already do.
- **Release branches only** — suits maintaining many versions; too heavy for a young single-line project.
- **Keep deploy-on-merge** — simplest, but nothing stands between a merged PR and users.

## Consequences
- A merged fix is not live on Pages until the next release; urgent fixes need a quick release.
- Hosted app version and image version always match.
- A bad release is rolled back by tagging a fixed patch (re-deploy) or re-running the deploy of the previous tag.
- The first tag-triggered deploy is the test of the changed workflow.
