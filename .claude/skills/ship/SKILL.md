---
name: ship
description: Ship the current Yodo branch — push, open a PR, run a fresh-context review, and squash-merge only on the user's command.
argument-hint: "[optional issue number]"
disable-model-invocation: true
---

# Ship workflow

Issue: $ARGUMENTS

Ask once for the docs sync, the push and the PR together (step 1b), to save a round-trip. Never merge without an explicit "merge".

## 1. Pre-flight
- Not on `main`; working tree clean; definition of done (`docs/conventions.md`) met — re-run tests/lint if anything changed since the last run.
- Rebase onto the latest `main` if it moved (`git fetch` then `git rebase origin/main`); re-run tests after a rebase.

## 1b. Sync docs (before pushing, so they land in the same PR)
- Sweep for data, requirements or decisions this branch made stale:
  - `docs/roadmap.md`: tick the task row (`✓`, as 0.1 shows).
  - `docs/plan.md`: add a dated "Done" line to History, and update Status ("Last done" and "Next step" with the next task and its issue).
  - Also `docs/adr/README.md`, `docs/product.md`, `docs/ui.md`, `docs/conventions.md`, README, CLAUDE.md and project memory.
- Note issues the branch also resolves (beyond the task's own), to list as `Closes #n` in the PR body.
- In **one message**, list each stale item (file, what's outdated, proposed fix; or say nothing is stale) plus the proposed PR title and a one-line body outline, and ask one question: apply the sync, push and open the PR? Leave superseded ADRs as history.
- On the OK: commit the edits as `docs: sync docs for <task id>` (commit workflow), then go straight on to step 2 without asking again.

## 2. Push and open the PR
- Push with `git push -u origin <branch>`.
- Open the PR with `gh pr create`:
  - **Title** = the future squash commit, in Conventional Commit format (e.g. `feat(web): add rectangle tool`).
  - **Body:** Summary (what + why), "Done when…" checklist with evidence, How to test, Screenshots for UI changes, `Closes #n`.
  - No AI attribution line in the body (owner's convention).

## 3. CI
- Do not watch or poll CI (it burns tokens while nothing happens). Give the PR link, then stop: the user reports when CI is green or which job failed.
- On a failure, read only the failed log (`gh run view --log-failed`), fix on the branch via the commit workflow, push again.

## 4. Review
- The branch is normally reviewed before `/ship`: `/feature` and `/fix` end with the reviewer command, and the user fixes findings in that clean session. If the user says the branch was not reviewed, give that command now (same format as the `/feature` hand-off) and wait until they come back.
- Comments that show up on the PR itself (the user's own review, or anything else) are triaged as below.
- Triage every finding with the user, one of:
  - **Fix now:** a new commit on the branch; resolve the comment thread (the ruleset blocks merging with unresolved threads).
  - **Later:** propose a follow-up issue and create it only after the user agrees: `gh issue create --label review` with the finding, the file/line and a link to the PR. Reply on the comment thread with the issue link, then resolve it.
  - **Disagree:** reply on the thread explaining why, then resolve it. Never skip a finding silently.
- `gh` has no subcommand for review threads; use GraphQL (`{owner}`/`{repo}` are filled in by `gh`):
  - List: `gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<n> -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{id isResolved path line comments(first:1){nodes{body}}}}}}}'`
  - Reply: `gh api graphql -F id=<thread id> -f body='<text>' -f query='mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{url}}}'`
  - Resolve: `gh api graphql -F id=<thread id> -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}'`
- The user does the final review.

## 5. Merge (only on explicit command)
- Claude Code's auto mode blocks Claude from merging, and the owner merges anyway: give the user `! gh pr merge <n> --squash` to run. The PR title becomes the commit subject, and GitHub deletes the remote branch.
- Then `git fetch --prune && git switch main && git pull --ff-only`.
- Delete the local branch only after checking nothing is lost: a squash merge makes `git branch -d` always refuse, so confirm `git diff <branch> main` is empty first, then `git branch -D <branch>`. If the diff is not empty, stop and show it to the user.
- Recap and suggest `/clear` before the next task.
