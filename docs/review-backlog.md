# Review backlog

Follow-ups from code reviews, kept here instead of as GitHub issues (the `review` issues were deleted on 2026-11-09, after checking each against the code). Nothing here is a blocker. Each item says where the problem is and a possible fix. The old issue numbers are kept so old PRs and commits still make sense.

Not carried over: #65 (text lost when the tab closes) was fixed by the flush on `visibilitychange`/`pagehide` in `web/src/ui/App.tsx`. #2, #3, #4, #67 and #101 were already closed.

## CI and tests

- **#149 Flaky e2e under full-suite load.** `e2e/tests/shortcuts.spec.ts` ("? opens a searchable list…", `hosted-webkit`) and `search.spec.ts` ("a restored drawing is found again by its canvas text", `self-hosted-chromium`) fail in full `npm test` runs and pass alone. Find the missing wait instead of adding retries. Investigated 2026-11-13 (Node 24, about 4,000 runs with `--repeat-each` and full suites): the search test failed once (self-hosted-webkit, at the first search, not after restore: the Home search box was empty after `fill`), the shortcuts test never failed. No cause found in the app. Next: run with `--trace retain-on-failure` (CI keeps one on retry) until it fails, then read the trace. Untested guess for shortcuts: `?` pressed before `App.tsx` attaches its keydown listener in an effect.
- **#76 Gate the Pages deploy on the e2e job.** In `.github/workflows/ci.yml` the `deploy` job has `needs: web` only, so Pages can be published while `e2e` fails. Make it also need `e2e` (or the `ci` gate). It changes the deploy policy of ADR 0018, so decide whether it needs an ADR.
- **#69 Restore console spies in storage tests.** `autosave.test.ts` spies on `console.error` without always restoring. Restore in `afterEach` or set `restoreMocks`.
- **#62 Harden the `test:server` setup** (`web/test/server-setup.ts`). A failed `go build` leaves the temp dir behind; there is no SIGKILL fallback in `stop()` and no timeout on the health `fetch`; strip inherited `YODO_*` variables once `YODO_PASSWORD` exists.
- **#57 Tighten the failed-save contract test** (`web/src/storage/contract.ts`). Also cover a failed re-save of an existing drawing, and assert the real `DataCloneError`. Move the `async` comment in `memory.ts` to the class or `save()`.
- **#105 Palette twin test is too weak** (`web/src/ui/styleOptions.test.ts`). It also passes when a colour falls through to `adaptCustom`. Compare against explicit twins, or check membership in the `TWINS` keys.

## Server

- **#59 Add `ReadTimeout`/`WriteTimeout`/`IdleTimeout`** to the `http.Server` in `server/cmd/yodo/main.go`. Only `ReadHeaderTimeout` is set, so a stalled 16 MiB upload holds a connection. Pick bounds that suit a slow LAN, with a test.
- **#60 Deterministic metadata errors in `parseDocumentMeta`** (`server/internal/server/drawings.go`). The loop ranges over a map, so the 400 names a random field; use a fixed-order slice. Also: `schemaVersion` as `int64` rejects `1.0`, which JS treats as an integer (fix the comment or accept it), and rewrap the long line in `server.New`'s doc comment.

## Storage

- **#54 IndexedDB upgrades across tabs** (`web/src/storage/indexeddb.ts`). `DB_VERSION` is already 4 and these are still open: after another tab upgrades, every call fails with `VersionError` and nothing tells the user to reload; `blocking` can close a connection a call already holds; there is no `blocked` handler, so opening can hang.
- **#55 Document that `DrawingRepository.get` rejects with `DocumentError`** (for example `newer-version`) in `repository.ts`, and make sure callers (Home, auto-save) handle it.
- **#56 Call `navigator.storage.persist()` at startup in hosted mode** (ADR 0005), so Safari doesn't evict drawings after 7 days. Not done anywhere yet.
- **#63 Validate drawing ids where documents enter the app.** `migrate()` only checks `typeof id === 'string'`. `""`, `"."`, `".."` and lone surrogates behave differently between IndexedDB and HTTP. Reject them once in core (or require a UUID) and add contract cases against the real server. It touches ADR 0013.
- **#68 Save error cleared on undo** (`autosave.ts`, `if (!dirty()) failed = false`). A save whose response was lost may have reached the server, so "Saved" after undo can be wrong. Low confidence. Consider resaving once after a failure even when not dirty.

## Home screen (`web/src/ui/`)

- **#72 Keep the "New drawing" tile when listing fails.** `Home.tsx` replaces the whole grid with the error. Show the error above the grid.
- **#73 Return focus to the card's ⋯ button when its menu closes** (`DrawingCard.tsx`), and close the menu when focus leaves it.
- **#71 Redraw thumbnails on resize or DPR change** (`Thumbnail.tsx`). The bitmap is sized once. Use a `ResizeObserver` and a DPR media query.
- **#74 Load the Caveat subsets a thumbnail's text needs** (`Thumbnail.tsx`, `thumbnailDocument.ts`). Only `document.fonts.ready` is awaited, so latin-ext and Cyrillic text draws in the fallback font. Call `document.fonts.load(font, text)` per text, or redraw on `loadingdone`.

## Editor UI

- **#113 Guard the password dialog's `contains()`** (`Gate.tsx`). If an event targets `window`, `contains` throws and the guard fails open. Check `target instanceof Node` first and add a test.
- **#52 Toolbar: use `aria-keyshortcuts`.** `Toolbar.tsx` has `aria-label="Rectangle, shortcut R"`. Use `aria-label="Rectangle"` plus `aria-keyshortcuts="R"` and update the test.
- **#99 Style panel: keep per-key typing for `CHOICES`** (`StylePanel.tsx`). The cast to `Record<…>` lets a new style key compile and crash in `ChoiceSection`. `ORDER` repeats the order from `stylesOf`.
- **#98 Style panel: show an exact font size as its number.** The Size section says "Custom" for 23 px while the bar says "23". Share one helper.
- **#66 Rename App's `document` prop to `drawing`** (`App.tsx`). It shadows the global `document`.

## Core

- **`insideBox` square corners** (`core/editor/selection.ts`). #142 made `hitTest` circular at corners, but the drag fallback for an already selected element still grows its box on x and y separately. Use the same distance as `hitTest`.
- **#44 Pencil hit-test and bounds use raw samples**, not the drawn curve (`hit.ts`, `rect.ts`; ADR 0024). They disagree at sharp turns, but with dense real input the gap is under a pixel. Flatten the smoothed path, or accept it.
- **#43 Pencil performance on long strokes.** `freehand.ts` `appendPoint` and `rect.ts` `elementBounds` use `Math.max(...xs)`, which is O(n²) per stroke and throws a `RangeError` past about 1e5 points. `drawStroke` also rebuilds its path every frame. Use incremental min/max, loops, and a per-element path cache.
- **#49 Eraser: pre-filter by bounds** (`editor.ts`, `idsAlongPath` in `selection.ts`). Every element is hit-tested against every sample, and already-marked ids aren't skipped.
- **#50 `isDrawingTool` should list the drawing tools** (`editor.ts`), not the non-drawing ones, so a new tool fails safe.
- **#51 `markErased` comment claims document order** (`editor.ts`). The marks keep drag order. Fix the comment.
- **#46 Cache label layout** (`render.ts` `drawLabel`). `layoutText` runs for every labelled shape on every frame. Memoise per (text, family, size, wrap width). It matters for the 1,000-element benchmark in `docs/product.md`.
- **#47 Tidy text targeting and shared label types.** `textTargetAt` hit-tests a copy with a fake label (a `containsPoint` helper or an `inside` option would replace it). `LabelledShape` is defined in both `core/text/layout.ts` and `core/editor/text.ts`, plus an `Extract<…>` in `render.ts`. `contextMeasure` in `render.ts` repeats `createCanvasMeasure` in `ui/measure.ts`.
