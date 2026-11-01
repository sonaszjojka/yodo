# Yodo — Working Conventions

> Status: **approved 2026-10-30** (Stage 6 of `docs/plan.md`). How code gets from an idea to `main`. The workflows are encoded as Claude Code skills in `.claude/skills/` (see the end of this file).

## Commits: Conventional Commits
Format ([conventionalcommits.org](https://www.conventionalcommits.org/)):
```
<type>(<scope>): <subject>

<body: why, not what>

<footer: Refs #12 / Closes #12 / BREAKING CHANGE: …>
```
- **Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
- **Scopes:** `web`, `server`, `e2e`, `docs`, `ci`, `deps`. Omit the scope if a change spans most of the repo.
- **Subject:** imperative, lower case, no period, ≤ 72 characters (`add rectangle tool`, not `Added rectangle tool.`).
- **Breaking change:** `!` after the type/scope (`feat(web)!: …`) plus a `BREAKING CHANGE:` footer. Document format changes follow ADR 0013 (bump `schemaVersion` + migration).
- **No AI attribution trailer.** Commits carry no `Co-Authored-By` line; the owner is the sole author.

## Branches and flow: GitHub flow with squash merge
- `main` is always deployable (it deploys to GitHub Pages) and is protected: changes land only through PRs with green CI.
- Enforced on GitHub: repo settings allow squash merge only (commit title = PR title) and delete merged branches; the ruleset "Protect main" requires a PR (0 approvals, since a solo owner cannot approve their own PR) with all review threads resolved, and blocks force-push and deletion, with no bypass, and requires the `ci` status check to pass ([ADR 0018](adr/0018-ci-github-actions-gate-job.md)).
- One short-lived branch per roadmap task or bug: `<type>/<id>-<slug>`, e.g. `feat/1.2-rectangle-tool`, `fix/42-undo-after-delete`, `docs/roadmap-m2`.
- The loop for every change:
  1. `/clear`, then state one goal (a roadmap task or an issue).
  2. Plan mode for anything bigger than a small fix; the owner approves the plan.
  3. Implement in small steps, tests first where practical (ADR 0011).
  4. Verify against the definition of done below.
  5. Claude commits on the branch (the plan approval covers it; `/feature` and `/fix` do this) and ends with the reviewer command for the branch.
  6. The owner runs `/code-review low <branch>` in a fresh context (`medium` only for risky changes: storage, auth, document format). One round per branch, with no re-review after the fixes: fix correctness bugs there; a cleanup becomes a follow-up issue labelled `review` only if the owner wants it (created with the owner's OK), otherwise it is dropped. Severity-based triage keeps the review loop finite.
  7. Back in the authoring session, `/ship`: sync the docs the branch made stale (roadmap tick, plan status, others with the owner's OK) as a commit in the same PR, then push and open a PR (title = the future squash commit, in Conventional Commit format) on the owner's command; the owner reviews the PR, and every PR comment thread is fixed or answered and resolved before merge.
  8. Squash-merge on the owner's command; delete the branch; `/clear`.
- Worktrees only for genuinely parallel sessions (e.g. web and server at once), each on its own branch.

## Definition of done
A task is done only when all of these hold:
- Its "done when…" criterion from `docs/roadmap.md` (or the issue) is met.
- New behaviour has tests; the full test suites pass (web and/or server, whichever changed).
- Lint and format checks are clean; TypeScript type-check passes.
- UI changes have been checked in the browser (screenshot), in light and dark theme once dark mode exists.
- Docs that the change made stale are updated (ADR for any architectural decision, `docs/ui.md`, README).
- No secrets in the diff.

## Who does what
| Step | Claude | Owner |
|---|---|---|
| Plan, code, tests, verification | does | approves the plan |
| Commit | commits on the branch after the approved plan | can amend or reject before `/ship` |
| Branch, push, PR | prepares the command | approves each one |
| Merge | prepares the command | runs it (`! gh pr merge <n> --squash`; Claude Code blocks Claude from merging) |
| Review | gives the reviewer command; triages PR comments, proposes follow-up issues | runs the review in a fresh session and fixes findings; approves issues, final review + merge |

## License
**MIT.** Short, permissive and common for self-hostable tools (Excalidraw also uses MIT); fits the goal of letting anyone run their own copy. `LICENSE` is in the repo root.

## Skills (`.claude/skills/`)
| Command | Use for |
|---|---|
| `/feature <task id or description>` | A roadmap task or new behaviour, end to end up to the PR. |
| `/fix <issue # or bug description>` | A bug: reproduce, failing test, fix, verify. |
| `/commit` | Propose a Conventional Commit for the current changes. |
| `/ship` | Push, open the PR, review, and merge on command. |
| `/adr <decision>` | Record an architectural decision as an ADR. |
