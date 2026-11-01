---
name: fix
description: Fix a Yodo bug the disciplined way — reproduce, write a failing regression test, find the root cause, fix, verify, commit — following docs/conventions.md.
argument-hint: <issue number or bug description>
disable-model-invocation: true
---

# Bug-fix workflow

Bug: $ARGUMENTS

## 1. Pin down the bug
- If it's an issue number, read it with `gh issue view <n>`.
- Restate: steps to reproduce, expected behaviour, actual behaviour, environment (hosted/self-hosted, browser). If any is missing and cannot be inferred, ask before going further.

## 2. Branch
- Clean `git status`, up-to-date `main`, then propose `fix/<issue#>-<slug>` (or `fix/<slug>` without an issue); create it after approval.

## 3. Reproduce
- Reproduce it for real: run the failing flow in the app, the API with `curl`, or a quick script. Record what you observed.
- If you cannot reproduce it, stop and report what you tried — do not guess-fix.

## 4. Failing test first
- Write the smallest test at the lowest layer that shows the bug (core unit > repository contract > Go handler > Playwright; ADR 0011). Run it and confirm it fails for the right reason.

## 5. Root cause
- Find why it happens, not just where. Explain the cause in one or two sentences to the user before changing code.
- Check whether the same cause can break other places; mention them, but fix only what is in scope (propose follow-up issues for the rest).

## 6. Fix minimally
- Smallest change that addresses the root cause. No drive-by refactors.
- The new test passes; the full suites for the changed parts pass.

## 7. Verify
- Re-run the original reproduction and confirm the bug is gone (screenshot for UI bugs).
- Lint, format, type-check clean. Definition of done in `docs/conventions.md`.

## 8. Commit
Commit without a separate approval step, as in `/feature` step 6. Follow `.claude/skills/commit/SKILL.md` (type `fix`; body states the root cause; footer `Closes #<issue>` if there is one).

## 9. Hand off
Recap: cause, fix, how the test guards it, what's worth learning. End with the reviewer command for the branch, in the same format as the `/feature` hand-off (`.claude/skills/feature/SKILL.md`, step 7). When the user comes back after the review, suggest `/ship` — do not push on your own.
