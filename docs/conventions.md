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
- Enforced on GitHub: repo settings allow squash merge only (commit title = PR title) and delete merged branches; the ruleset "Protect main" requires a PR (0 approvals, since a solo owner cannot approve their own PR) with all review threads resolved, and blocks force-push and deletion, with no bypass. The CI status check is added to the ruleset in roadmap task 0.3.
- One short-lived branch per roadmap task or bug: `<type>/<id>-<slug>`, e.g. `feat/1.2-rectangle-tool`, `fix/42-undo-after-delete`, `docs/roadmap-m2`.
- The loop for every change:
  1. `/clear`, then state one goal (a roadmap task or an issue).
  2. Plan mode for anything bigger than a small fix; the owner approves the plan.
  3. Implement in small steps, tests first where practical (ADR 0011).
  4. Verify against the definition of done below.
  5. Claude proposes the commit (message + diff summary); the owner approves before it is made.
  6. Push and open a PR (title = the future squash commit, in Conventional Commit format) on the owner's command.
  7. `/code-review --comment` in a fresh context (findings become inline PR comments), then the owner reviews the PR. Each finding is fixed in the PR, deferred to a follow-up issue labelled `review` (created with the owner's OK), or answered with a reason; every thread is resolved before merge.
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
| Commit | prepares message + diff | approves |
| Branch, push, PR, merge | prepares the command | approves each one |
| Review | runs `/code-review --comment`, triages findings, proposes follow-up issues | approves issues, final review + merge |

## License
**MIT.** Short, permissive and common for self-hostable tools (Excalidraw also uses MIT); fits the goal of letting anyone run their own copy. `LICENSE` is added with the repo in Part B.

## Skills (`.claude/skills/`)
| Command | Use for |
|---|---|
| `/feature <task id or description>` | A roadmap task or new behaviour, end to end up to the PR. |
| `/fix <issue # or bug description>` | A bug: reproduce, failing test, fix, verify. |
| `/commit` | Propose a Conventional Commit for the current changes. |
| `/ship` | Push, open the PR, review, and merge on command. |
| `/adr <decision>` | Record an architectural decision as an ADR. |
