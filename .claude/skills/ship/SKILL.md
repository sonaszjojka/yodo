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
- Suggest the user run `/code-review --comment` on the PR (a fresh context catches what the authoring session misses); findings land as inline PR comments.
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
- `gh pr merge --squash --delete-branch`, keeping the PR title as the commit subject.
- `git switch main && git pull --ff-only`.
- If the task came from `docs/roadmap.md`, mark it done there in the next docs commit (or include it in the PR).
- Recap and suggest `/clear` before the next task.
