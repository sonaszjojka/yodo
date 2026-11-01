---
name: ship
description: Ship the current Yodo branch — push, open a PR, run a fresh-context review, and squash-merge only on the user's command.
argument-hint: "[optional issue number]"
disable-model-invocation: true
---

# Ship workflow

Issue: $ARGUMENTS

Ask before each of: push, opening the PR, merging. Never merge without an explicit "merge".

## 1. Pre-flight
- Not on `main`; working tree clean; definition of done (`docs/conventions.md`) met — re-run tests/lint if anything changed since the last run.
- Rebase onto the latest `main` if it moved (`git fetch` then `git rebase origin/main`); re-run tests after a rebase.

## 2. Push and open the PR
- Push with `git push -u origin <branch>`.
- Open the PR with `gh pr create`:
  - **Title** = the future squash commit, in Conventional Commit format (e.g. `feat(web): add rectangle tool`).
  - **Body:** Summary (what + why), "Done when…" checklist with evidence, How to test, Screenshots for UI changes, `Closes #n`.
  - No AI attribution line in the body (owner's convention).

## 3. CI
- Watch with `gh pr checks --watch`. If a check fails, read the log (`gh run view --log-failed`), fix on the branch via the commit workflow, push again.

## 4. Review
- Suggest the user run `/code-review` on the PR (a fresh context catches what the authoring session misses). Address findings with new commits; explain any finding you disagree with instead of silently skipping it.
- The user does the final review.

## 5. Merge (only on explicit command)
- `gh pr merge --squash --delete-branch`, keeping the PR title as the commit subject.
- `git switch main && git pull --ff-only`.
- If the task came from `docs/roadmap.md`, mark it done there in the next docs commit (or include it in the PR).
- Recap and suggest `/clear` before the next task.
