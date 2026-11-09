# 0059. Require a Developer Certificate of Origin sign-off instead of a CLA

- Status: Accepted
- Date: 2026-11-09

## Context
Yodo is MIT-licensed and open to outside contributions. We want a clear statement that contributors have the right to submit their code, without legal paperwork that discourages small contributions.

## Decision
- Every commit in a contribution carries a `Signed-off-by:` line (`git commit -s`), the [Developer Certificate of Origin](https://developercertificate.org/) 1.1. Contributions are under the repository's MIT license (inbound = outbound).
- A DCO check on pull requests (the `dcoapp/app` GitHub App, installed by the owner) blocks PRs with unsigned commits. The check is added to branch protection once it is stable.
- No CLA. The owner's own commits are also signed off.

## Alternatives considered
- **CLA with a bot** — gives the owner the right to relicense, but adds friction and a signing step for every contributor; relicensing is not a goal.
- **Nothing (implicit MIT)** — works legally on GitHub, but records no per-change statement of origin.

## Consequences
- Contributors must remember `-s`; CONTRIBUTING explains how to fix it (`git rebase --signoff`).
- Squash merge keeps the PR title and body, so the sign-off is checked on the PR's commits, and the squash commit keeps the author's sign-off in its body.
- If relicensing is ever wanted, every contributor's consent is needed, as with any MIT project without a CLA.
