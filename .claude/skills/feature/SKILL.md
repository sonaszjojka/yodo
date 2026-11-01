---
name: feature
description: Implement a Yodo roadmap task or new behaviour end to end — branch, plan, test-first implementation, verification, commit — following docs/conventions.md.
argument-hint: <roadmap task id, e.g. 1.2, or a short description>
disable-model-invocation: true
---

# Feature workflow

Goal: $ARGUMENTS

## 1. Understand
- If the goal is a roadmap id, read its row in `docs/roadmap.md`; otherwise find the matching feature in `docs/product.md`. Quote the "done when…" criterion back to the user. If none exists, propose one and wait for approval.
- Read what constrains it: relevant ADRs (`docs/adr/README.md`), `docs/ui.md` for anything visible, and the code it touches.
- If the task needs an architectural decision not covered by an ADR (the roadmap flags known ones), stop and run the `/adr` workflow first.
- If the task looks bigger than one session, propose a split and update `docs/roadmap.md` before starting.

## 2. Branch
- Check `git status` is clean and you are on an up-to-date `main` (`git pull --ff-only`).
- Propose the branch name `feat/<id>-<slug>` (e.g. `feat/1.2-rectangle-tool`) and create it only after the user approves.

## 3. Plan
- For anything beyond a trivial change, enter plan mode and present: files to change, the public API/types, the tests you will write, how you will verify, and any trade-off with 2–3 options and a recommendation.
- Wait for approval.

## 4. Implement in small, verifiable steps
- Test first where practical (core logic, geometry, repositories, Go handlers — ADR 0011); see the test fail, then make it pass.
- Keep `web/src/core` free of React imports (ADR 0002). Data access only through `DrawingRepository` (ADR 0005).
- Do not add features, refactors or dependencies beyond the plan. A new dependency needs the user's approval first.
- Explain non-obvious choices briefly as you go.

## 5. Verify (definition of done in `docs/conventions.md`)
- Run the test, lint, format and type-check commands for every part that changed (see the project CLAUDE.md for exact commands). All must pass; report failures with output rather than hiding them.
- For UI changes, run the app and check the behaviour in the browser with a screenshot (light theme, and dark once it exists).
- Check the "done when…" criterion item by item and say which evidence proves each.
- Update docs the change made stale; tick nothing in the roadmap until merged.

## 6. Commit
Commit without a separate approval step: approving the plan covers it. Otherwise follow `.claude/skills/commit/SKILL.md` (type `feat`, scope by area, `Refs #<issue>` if one exists): guard secrets, split unrelated changes into separate commits, stage files by name, and show `git log --stat` for the new commits. Leave out docs edits the user has not approved yet, and say so.

## 7. Hand off
Give the recap: what was done, why that way, what's worth learning. End with the reviewer command, made to stand out: its own bold header line, then a fenced block holding only the command, with the real branch name:

**👉 Reviewer command: run in a clean session (`/clear` or a new terminal), fix findings there, then come back**
```
/code-review medium <branch>
```
`medium` is the default level; suggest a higher one only for risky changes (storage, auth, document format). When the user comes back after the review, suggest `/ship` — do not push on your own.
