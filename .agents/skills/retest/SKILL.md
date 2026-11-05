---
name: retest
description: Independently re-verify a Yodo branch — re-run the definition-of-done checks, then check the done-when items and the review fixes in a real browser with throwaway Playwright scripts — and report a table, without editing the repo. Used by the /deliver pipeline's Codex retest worker.
---

# Retest

You are an independent verifier. You didn't write the code, and you don't fix it. Your job is to show, with evidence, whether the branch does what its done-when criterion says.

## Rules
- **Don't touch tracked files.** Don't edit, stage, commit, push or check out anything in the repo. Build output that is already git-ignored is fine (`web/dist`, `e2e/.bin`, test results).
- **Scratch work goes outside the repo:** write screenshots and logs to a new temp directory (`mktemp -d`). Name that directory in your report. The one exception is the Playwright script, which always goes to the fixed path `/tmp/yodo-retest/check.mjs` (create `/tmp/yodo-retest/` first, overwrite the file each run): the owner's Codex rules allow exactly that command without a prompt, and a rule can't match a path that changes every run. Pass the temp directory to the script as an argument for its output.
- **Keep the output small:** run the checks with quiet reporters and show only what failed (see "Mechanical checks"). Don't paste full logs into the report.
- **Make each check independent:** start from a fresh page (new context, or reload with storage cleared), so one check can't break the next. If a result looks wrong, run that check again on its own before calling it a failure.
- **Sandbox:** Codex's sandbox blocks launching a browser, opening a port, and network access. Use the exact commands below; the owner's Codex rules can allow them outside the sandbox without a prompt. Run your Playwright script outside the sandbox from the start (request escalation with a one-line reason), instead of letting it fail inside the sandbox first. Because the sandbox has no network, do every HTTP check inside that script (`page.request` or `fetch`), not with `curl`.
- **Node:** report `node -v` in MECHANICAL. The project targets Node 24 (`web/.nvmrc`). If the shell has another major version, say so in the report; don't work around it.
- **Clean up:** stop every server and browser you started. Leave the temp directory in place for evidence.

## 1. What to check
The task spec gives you the branch, the done-when criterion, and either the review-fix commits or "no fixes".
- One row per done-when item.
- For each fix commit: read it (`git show --stat`, then only the hunks you need), and state in one line what it claims to fix and how a user would see that.

## 2. Mechanical checks
Run the definition-of-done commands from `CLAUDE.md` for every part the branch changed (`git diff --name-only main...HEAD`):
- **web:** `npm test -- --reporter=dot`, `npm run lint`, `npm run format:check`, `npm run build`
- **server:** `go test ./...`, `golangci-lint run`, `golangci-lint fmt --diff`
- **e2e:** `npm run lint`, `npm run format:check`, `npm run typecheck`; run `npm test` only when the branch changed `e2e/` itself

Report pass or fail with counts. For a failure, give at most the 30 lines that show it.

## 3. Behaviour checks in the browser
- **The modes.** Hosted (IndexedDB) is always checked: `npx vite --host 127.0.0.1 --port <free port> --strictPort` in `web/`. Without `--host`, Vite listens only on `localhost` (IPv6 `::1`), and `127.0.0.1` gets no answer. Check self-hosted (HTTP) as well when the branch touches `web/src/storage/`, `server/` or the document format: in `e2e/`, `npm run build:app`, then `node scripts/serve-server.ts <free port>` (listens on `127.0.0.1`).
- **Playwright from a scratch script:** the repo's install is in `e2e/` (its Chromium, Firefox and WebKit are already downloaded). Load it from outside the repo like this:
  ```js
  import { createRequire } from 'node:module'
  const { chromium } = createRequire('<repo>/e2e/package.json')('playwright')
  ```
  Run it as `node /tmp/yodo-retest/check.mjs <tempdir>`. Use Chromium by default. Add Firefox or WebKit only when a done-when item or fix is about browser-specific input or rendering.
- **The canvas** is the drawing surface. Draw with `page.mouse` (`move`, `down`, `move` with `steps`, `up`), and press keys with `page.keyboard`. To check what was drawn, read pixels in `page.evaluate` (for example the bounding box of non-background pixels before and after an action). Use the DOM and accessibility tree for the UI chrome (toolbars, menus, dialogs). Measure in CSS pixels.
- **Persistence:** reload the page (and in self-hosted mode, check `GET api/drawings`) to show that the change survives a reload.
- **Evidence:** save a screenshot for each failure and one of the final state, to the temp directory. Watch the console (`page.on('console')` and `pageerror`), and report any errors.
- **Logic only in `web/src/core/`:** a named unit test that pins the behaviour is enough; you don't need a browser for it.
- **Server only:** call the self-hosted server above from a script (`fetch`); it already uses a throwaway data dir.

## 4. Report
End with exactly this structure. It is what the coordinator parses:

```
OUTCOME: pass | fail | could-not-test
SCRATCH DIR: <path>
MECHANICAL: <part: command → pass/fail (counts)>, ...
CHECKS:
| # | What (done-when item or fix) | Mode/browser | Result | Evidence |
|---|---|---|---|---|
| 1 | ... | hosted/chromium | pass | <what was measured, e.g. bbox 120×80 → 0×0 after undo; screenshot path> |
FAILURES:
1. <check #> — <what happened vs. expected>
   Repro: <steps>
   Suspected cause: <file:line if you found it, else "unknown">
NOT CHECKED: <what and why, or "nothing">
```

Use `FAILURES: none` when everything passed. Describe each result in words, because the coordinator opens screenshots only for failures.
