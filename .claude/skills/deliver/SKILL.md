---
name: deliver
description: Run the whole Yodo feature cycle from one session with Orca orchestration — Claude plans, a Codex worker reviews the plan adversarially, Claude implements, Codex reviews the code (up to 2 rounds) and retests it in a browser with Playwright, then fix or /ship up to an open PR. The merge stays with the owner.
argument-hint: <roadmap task id, e.g. 1.7, or a short description>
disable-model-invocation: true
---

# Deliver workflow (ADR 0037)

Goal: $ARGUMENTS

This session is the **coordinator**. It plans and implements itself (Claude), and it starts **Codex workers** through Orca for the two reviews. The skill chains the existing workflows and doesn't duplicate them. At each stage, read the named `SKILL.md` and follow it, with the overrides listed here. For the hand-offs between stages this file wins; inside a stage, the stage skill wins.

## Models (change them here only)
| Role | Agent | `--model` | `--effort` |
|---|---|---|---|
| Plan, implement, fix (this session) | Claude | the session's model (Opus 5.5, medium) | — |
| Plan review | Codex | `gpt-6.1-sol` | risk-based (below) |
| Code review round 1 | Codex | `gpt-6.1-sol` | risk-based (below) |
| Code review round 2 (fixes only) | Codex | `gpt-6.1-sol` | `medium` |
| Retest | Codex | `gpt-6.1-sol` | `medium` |

**Risk-based effort:** `high` when the task touches storage (`web/src/storage/`, `server/`), the document format or migrations, auth or the Host/Origin checks (ADR 0020), or undo/redo. Otherwise `medium`, which is the project minimum; never go lower. State the level you chose and why in the stage's status line.

## Token budget (applies to every stage)
- **Quiet checks:** run tests with quiet reporters (`npm test -- --reporter=dot`; `go test ./...` without `-v`). On a failure, read only the failing part (`| tail -n 40`, or rerun just the failing test), never the whole log.
- **Read narrowly:** find code with `grep -n` and read line ranges, not whole files. Use `git diff --stat` before any diff, then diff only the files you need.
- **Worker reports are the evidence:** don't rerun a check a worker already reported unless its report has a gap or a contradiction. Open a worker's screenshot only for a failure.
- **No duplicate context:** worker specs name files and commit ranges instead of pasting code. The only thing pasted is the plan, in stage 2.

## Orca rules
- Before stage 2, load the version-matched guide once: `orca skills get orchestration`. If Orca isn't running, start it with `orca open --json`. If `orca` or the `codex` agent isn't available, stop and suggest the manual loop (`/feature`, `docs/conventions.md`).
- Start each reviewer like this:
  `orca orchestration worker-start --spec-file <spec> --worktree current --agent codex --model <model> --effort <effort> --task-title "<title>"`
  Write the spec to a file in the session scratchpad (`--spec-file`), so quotes and backticks need no escaping.
- **After `worker-start`, end your turn.** Orca wakes you when the worker reports. Never poll, never run a watch script, and never type into the worker's terminal (use `orca orchestration send` if you need to steer it).
- Answer a worker's `question` with `orca orchestration reply` only when the answer follows from this skill or the task. Otherwise ask the owner.
- If `worker-start` fails, don't rerun it. Report `failedStage` and stop. An `escalation` (a worker stopped without `worker_done`), an `OUTCOME: could-not-review`, or a report that doesn't follow the review format also means: stop and ask the owner.
- **Approval prompts:** Codex's sandbox can stop a worker at an approval prompt: an `escalation` with `stopReason=needs-input`. It happens for anything the owner's Codex rules don't allow, at least the retest's Playwright script. Don't answer it with `send`, and don't count it as a failure. Tell the owner in one line which worker chat is waiting and for what, then end your turn.
- **Workspace guard:** the reviewers share this worktree. Don't touch files while a worker runs. When it reports, check that `git status --short` matches what it was before the worker started. If it doesn't, stop and show the diff to the owner.

## Gates (the only points where you stop and wait)
1. **Branch name and final plan**, together, after the Codex plan review (stage 3). Approving them also covers every commit this run makes: feature commits and review-fix commits.
2. **A round-2 review that still finds bugs** (stage 7).
3. **The single `/ship` question:** docs sync, push and PR, plus the review summary (stage 9).
4. **Merge:** the owner runs it. Never merge.

Also stop and ask, and don't work around it, when:
- an ADR is needed (`/feature` step 1),
- a check fails and the fix isn't obvious and in scope,
- the Codex retest (stage 8) fails (propose a fix and wait; this is not another review round),
- any of the Orca failures listed above happens.

Between the gates, don't ask "shall I continue?". Give a one-line status at the start of each stage (e.g. `Stage 2/10: Codex plan review (high: touches storage)`) so the owner can follow along.

## 1. Draft the plan (Claude)
- Follow `.claude/skills/feature/SKILL.md` **step 1** (understand: quote the done-when criterion, read the ADRs, `docs/ui.md` and the code).
- Check that `git status` is clean and that `main` is up to date (`git pull --ff-only`). Don't create the branch yet.
- Draft the plan the way `/feature` step 3 describes it: files to change, the public API and types, the tests, how you'll verify, and the trade-offs with a recommendation. Don't enter plan mode yet; the owner sees the plan only after the review.
- Pick the branch name `feat/<id>-<slug>`.

## 2. Plan review (Codex worker)
Write the spec file with the following content (fill in the placeholders; paste the full plan), then start the worker with the plan-review model and end your turn:

> You are the adversarial plan reviewer for the Yodo repo at `<repo path>`. Follow `.agents/skills/review/SKILL.md`, section "Plan review", and its Rules and Output sections. Read `AGENTS.md` first. The task is `<roadmap id and title>`. Its done-when criterion is: `<quoted criterion>`. Nothing has been implemented yet, and `main` is checked out. Don't edit anything. Report with `worker_done`. Its body is the Output block from the review skill. Plan:
> `<the full plan>`

Don't add your own reasoning or doubts to the spec. The reviewer judges the plan as written.

## 3. Revise, then gate 1
- Triage every plan finding: **accept** (change the plan) or **reject**. Before rejecting a finding, check it against the code and docs, and keep a one-line reason.
- An accepted finding that needs an ADR follows the "an ADR is needed" stop rule.
- Present the revised plan through plan mode (`EnterPlanMode`, then `ExitPlanMode`). Put the branch name at the top. Put a table at the end: finding, severity, accepted/rejected, what changed or why not.
- Wait for approval, then create the branch.

## 4. Implement (Claude)
- Follow `/feature` **steps 4–6** as written: implement, verify, commit. Skip step 7 (the hand-off).
- Record the authoring SHA (`git rev-parse HEAD`). Later stages use it to tell review fixes apart from feature commits.

## 5. Code review round 1 (Codex worker)
Note `git status --short`, write the spec, start the worker with the code-review model, and end your turn:

> You are the code reviewer for branch `<branch>` of the Yodo repo at `<repo path>` (checked out). Follow `.agents/skills/review/SKILL.md`, section "Code review", and its Rules and Output sections. Read `AGENTS.md` first. Review `git diff main...<branch>` (commits `main..<authoring-sha>`). The task is `<roadmap id and title>`. Its done-when criterion is: `<quoted criterion>`. Don't edit, commit or push anything. Report with `worker_done`. Its body is the Output block from the review skill.

Don't add a summary of the implementation. The reviewer must not see the author's reasoning.

## 6. Triage and fix
Sort every finding into one bucket:
- **Bug, fix now:** `bug` or `rule` findings with a believable failure scenario.
- **Disagree:** the finding is wrong. Check it against the code before saying so, and keep a one-line reason.
- **Cleanup:** not fixed in this run. Collect them for the ship question, where the owner decides whether each becomes a `review` issue or is dropped.

For each bug, follow `.claude/skills/fix/SKILL.md` **steps 4–8 only**: failing test first, root cause, minimal fix, verify, commit. Overrides: stay on the feature branch, skip the issue lookup, and reproduce through the failing test (in the browser only when a test can't show the bug). Make one `fix(<scope>): …` commit per finding. Its body states the root cause and cites "Codex review round 1, finding N".

Keep the triage table; it goes into the ship question and the PR body.

- **No bugs to fix:** skip stage 7 and go to stage 8.
- **Bugs fixed:** go to stage 7.

## 7. Code review round 2 (Codex worker, the last round)
Start a new worker with the round-1 spec and this extra paragraph:

> This is round 2, the last round. It reviews only the fix commits `<authoring-sha>..HEAD`, in the context of the whole branch. Check that each fix really removes the defect from round 1, adds no new bug, and has a test that pins it. Don't re-review code the fixes didn't touch. The round-1 findings were: `<numbered list: severity, location, defect, and which commit fixed it>`.

Triage the result the same way, but don't fix anything yet:
- **No bugs** (only cleanups or disagreements): go to stage 8.
- **Bugs found:** this is gate 2. Show the owner the round-2 findings, your triage, and a proposed fix for each. There is no round 3. The owner chooses one of three:
  1. fix them now (as in stage 6, with commits citing "round 2", and no re-review), then go to stage 8;
  2. stop here and leave the branch for manual work;
  3. ship with the findings listed as open in the PR.

## 8. Retest (Codex worker, always)
An independent acceptance check in a fresh session. It always runs, with or without fix commits. It replaces Claude's `/retest`, which stays for the manual loop.

Note `git status --short`, write the spec, start the worker with the retest model, and end your turn:

> You are the independent verifier for branch `<branch>` of the Yodo repo at `<repo path>` (checked out). Follow `.agents/skills/retest/SKILL.md`. Read `AGENTS.md` first. The task is `<roadmap id and title>`. Its done-when criterion is: `<quoted criterion, one item per line>`. Review-fix commits to verify: `<sha — one-line claim, per fix>` or `none`. Don't edit, commit or push anything in the repo. Report with `worker_done`. Its body is the Report block from the retest skill.

When it reports:
- **`pass`:** go to stage 9. Carry its CHECKS table into the PR body.
- **`fail`:** open only the failure screenshots. Confirm the failure (the reported repro, or the failing test), then propose a fix (test first, as in `/fix`) and wait for the owner. After an approved fix, start one new retest worker scoped to the failed checks. If that also fails, stop and ask.
- **`could-not-test`, or a NOT CHECKED list that leaves out a done-when item:** tell the owner what's missing, then check those items yourself in Chrome as in `.claude/skills/retest/SKILL.md` step 3, or ask.

## 9. Ship: `.claude/skills/ship/SKILL.md`
- Run steps 1, 1b, 2 and 3.
- In the step 1b message, add the review summary:
  - the plan-review findings: counts accepted and rejected;
  - for each code-review round: the model and effort, and the count in each bucket;
  - each fixed bug with its commit SHA, and each disagreement with its reason;
  - each cleanup with a proposed action (`review` issue or drop);
  - any open round-2 findings;
  - the retest outcome, plus its NOT CHECKED list.
  The owner answers everything in that one reply.
- Create the approved `review` issues after the PR exists, so they can link to it.
- Add a "Review" section to the PR body with the same summary.
- Stop after giving the PR link (no CI watching). Handle step 4 (PR comments) and step 5 (merge commands) only when the owner comes back.

## 10. Recap
Up to 5 bullets plus one "worth learning" line. Cover what was built, what each review found, and what was fixed. End with the merge command for the owner: `! gh pr merge <n> --squash`.
