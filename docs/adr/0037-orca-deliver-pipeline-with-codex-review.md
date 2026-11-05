# 0037. Deliver features through an Orca pipeline with Codex as the reviewer and verifier

- Status: Accepted
- Date: 2026-11-05

## Context
The manual loop in `docs/conventions.md` has Claude plan and implement. The owner then runs `/code-review medium` in a fresh Claude session, with one review round per branch. That has two weaknesses:
- The reviewer is the same model family as the author, so the two tend to share blind spots.
- The plan itself is never reviewed. Design mistakes are found only in code, where they cost the most to fix.

The owner now has Orca, which supervises agent workers and wakes the coordinator when a worker reports, and a Codex subscription. That makes a second model available as a reviewer at two points.

Codex doesn't read `CLAUDE.md` or `.claude/skills/`. It reads `AGENTS.md` and repo skills in `.agents/skills/`, which use the same `SKILL.md` format.

## Decision
`/deliver` runs the whole cycle from one Claude Code session, the coordinator:
1. Claude drafts the plan.
2. A Codex worker reviews the plan adversarially.
3. Claude revises the plan, and the owner approves it once.
4. Claude implements.
5. A Codex worker reviews the code, up to 2 rounds, and Claude fixes the bugs it finds.
6. A Codex worker retests the branch in a browser.
7. Claude ships the branch, or fixes it first, depending on the results.

- The Codex workers start with `orca orchestration worker-start --agent codex --worktree current`, are read-only by instruction, and report back through `worker_done`. The models are set in one table at the top of the skill. Every worker uses `gpt-6.1-sol`. Effort depends on risk: `high` for the plan review and round 1 when the task touches storage, the document format, auth or undo/redo; `medium` otherwise, and always `medium` for round 2 and the retest.
- Round 1 reviews the whole branch. Round 2 runs only if round 1 led to fixes, and it reviews only those fixes. If round 2 still finds bugs, the pipeline stops and the owner decides; there is never a third round.
- **The retest always runs, by Codex, in a fresh session.** It reruns the definition-of-done checks and checks every done-when item and every review fix in a real browser. It drives the app with throwaway Playwright scripts kept outside the repo, using the copy already installed in `e2e/`, and reports a table with evidence. Claude's `/retest` (which uses Claude in Chrome) stays for the manual loop and as the fallback.
- **Token budget:** the skill requires quiet check output, narrow reads, and worker reports as the evidence. Claude opens a screenshot only for a failure.
- The project rules reach Codex through a root `AGENTS.md` that points to `CLAUDE.md` (one source of truth). The checklists for both agents live in `.agents/skills/review/SKILL.md` and `.agents/skills/retest/SKILL.md`.
- The Claude-only workflow skills stay in `.claude/skills/`. Whether to merge the two skill folders is a separate follow-up.
- The manual loop in `docs/conventions.md` stays valid when Orca or Codex isn't available.

## Alternatives considered
- **A Claude subagent as the reviewer** (the first `/deliver` draft): needs no extra tools, but it is the same model family as the author, so it misses the same things. It also gives no plan review.
- **Calling `codex exec --sandbox read-only` from Bash:** simpler, and the sandbox enforces read-only access. But it blocks a shell call while Codex runs (Bash's 10-minute limit), the owner can't watch or talk to the worker, and there are no supervised `ask` questions or escalations. Rejected for the supervision features. Read-only access is kept by instruction instead.
- **Claude retests in Chrome** (the earlier step): already proven, but the author would be checking its own fixes, it's limited to Chrome, and screenshots are expensive in Claude's growing context.
- **Codex retests in Orca's built-in browser:** the owner could watch it, but the browser clicks elements by reference, so canvas input needs synthetic events through `eval`. Rejected in favour of Playwright's mouse API.
- **Moving all skills to `.agents/skills/` and symlinking `.claude/skills` to it:** one folder, but some frontmatter is Claude-only (`disable-model-invocation`, `$ARGUMENTS`), so every skill would need testing in both agents. Postponed as a follow-up.

## Consequences
- Every feature gets a review from a second model at the plan stage and at the code stage. The 2-round cap keeps the loop finite, the same as the severity triage did before.
- The retest is an acceptance check by a session that never saw the code being written. It can also cover Firefox and WebKit. The cost is one more worker per feature, even when the review found nothing.
- Two cost-saving ideas are postponed until a measured run (`/cost` in Claude, `/status` in Codex): skipping the plan review for small tasks, and a state file so the session can be cleared (`/clear`) after implementing.
- `/deliver` only works while Orca is running and the Codex subscription has quota. Without them, use the manual loop.
- The Codex workers share the coordinator's worktree. That's safe only because the coordinator is idle while a worker runs and the workers are told not to edit tracked files (the retest keeps its scripts in a temp directory). A worker that edits files anyway shows up in `git status` and stops the pipeline.
- Model ids are vendor names and will change. The model table in `/deliver` is the one place to update.
