---
name: retest
description: Re-verify a Yodo branch after its review round — re-run the definition-of-done checks and re-check each review fix and the affected done-when items in the browser, then report a table.
argument-hint: "[optional branch, defaults to the current one]"
disable-model-invocation: true
---

# Retest workflow

Branch: $ARGUMENTS (default: the current branch)

Runs between the review session and `/ship` (`docs/conventions.md`, workflow step 7). It verifies only and changes no code unless the user approves a fix.

## 1. Find what changed since the hand-off
- `git status` must be clean. Uncommitted review edits get committed first, following the commit workflow, with the user's OK.
- `git log --oneline main..HEAD`: the review fixes are the commits after the authoring session's last commit, usually `fix(...)` commits on a `feat/` branch. If it's unclear which ones they are, ask.
- For each fix commit, read the message and the diff (`git show <sha>`). State in one line what it claims to fix and how that could be observed.
- List the "done when…" items of the task (`docs/roadmap.md`) that touch the files the fixes changed. Those need a regression check too.

## 2. Mechanical checks
- Run the test, lint, format-check and type-check commands for every part the branch changed (`git diff --name-only main...HEAD`; commands are in CLAUDE.md). Report counts and the new tests from the review.
- Report a failure with its output and stop there. Don't fix it silently.

## 3. Behaviour checks
For each fix, and each affected done-when item, check what the user would observe:
- **Logic in `core/`:** a unit test that pins the fix is enough evidence. Name it.
- **UI and input:** run the app (`npm run dev` in `web/`, background task) and check in Chrome:
  - Load the browser tools in one ToolSearch call and work in a new tab. Batch the steps with `browser_batch`.
  - Measure in CSS pixels with `javascript_tool`. Screenshot coordinates can be scaled against CSS pixels, so check `innerWidth` and `devicePixelRatio` first.
  - The canvas is checked by reading pixels, e.g. the bounding box of drawn pixels, before and after an action.
  - Inputs the screenshot tool can't send (Ctrl+wheel, pinch, held keys) are dispatched as synthetic events with `cancelable: true`. The `dispatchEvent` return value shows whether the app called `preventDefault`.
  - Make each check independent: reset first (reload, or reset zoom/pan) so an earlier step can't push the subject off-screen and give a false result. If a result looks wrong, re-run it on its own before calling it a bug.
  - Read console errors, and take one screenshot of the final state for the user.
- **Server:** exercise the endpoint with `curl` against `go run ./cmd/yodo` on a temp data dir.
- Say plainly what wasn't re-checked and why, e.g. code the review didn't touch, or a browser Claude can't drive (Safari).

## 4. Clean up
Close the tabs you opened, and stop the dev server and any other background tasks.

## 5. Report
- A table with one row per check: what was checked, the result, and the evidence.
- If something fails, describe the failure and propose a fix (test first, as in `/fix`), and wait for the user's OK. This is not a second review round.
- If everything passes, suggest `/ship`. Don't push on your own.
