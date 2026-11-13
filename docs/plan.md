# Yodo: preparation before repositories and implementation

## Context
When this plan was written (2026-10-29), Yodo had a name and working tooling (git identity `sonaszjojka`, `gh` logged in, SSH working), but no files and no global CLAUDE.md. Before any code exists, we want to settle **what** we're building, **with what**, and **how we work**. Then implementation can move in small, verifiable steps, and Claude has context it can't read from the code.

Rule: every stage ends with a **file of decisions**, not just a conversation. Conversations disappear after `/clear`; files stay and go into the repo.

**Language:** from now on all communication, code, docs and other output are in English.

## Status (2026-11-13)
Read this section, not the whole file; finished work is logged in `docs/history.md`.
- Done before: roadmap 2.9 (issue #85): Excalidraw import (ADR 0014). **Import Excalidraw** on Home converts a `.excalidraw` file into a new drawing (shapes, text, arrows, pencil, images) and lists what was skipped or simplified.
- Done before: roadmap 2.8 (issue #84): `.yodo` export / import (ADR 0013, 0040). **Export** in the editor downloads the drawing with its images inlined as base64; **Import file** on Home takes a `.yodo` or `.excalidraw` file and saves it as a new drawing. (Since 4.9: one **Export** button with a Yodo file tab, ADR 0056.)
- Done before: roadmap 2.11 (issue #87): optional password. `YODO_PASSWORD` locks the API behind a login (in-memory sessions, httpOnly SameSite=Strict cookie, "Remember this browser" for 30 days); the app shows a password screen first, or a dialog over the inert drawing if the session ends mid-edit (ADR 0020).
- Done before: roadmap 2.12 (issue #88): performance benchmark (ADR 0042). `npm run perf` in `e2e/` measures pan, zoom and draw on a generated 1,000-element board with 5 images in a headed system Chrome and can append the run to `docs/perf/results.jsonl`; `renderScene` now skips elements outside the viewport, which took pan and zoom to 60 fps.
- Done before: roadmap 2.7a (issue #83, with 2.7b and 2.7c split off): PNG export (ADR 0041). An **Export image** button (top right, next to the `.yodo` Export from 2.8; Shift+Ctrl/Cmd+E) opens a dialog: whole drawing or selection, background on/off, dark version, 1x/2x/3x scale, file name, Copy and Download. The scene is drawn again with `renderScene` on an offscreen canvas, so pasted images export too. (Since 4.9: one **Export** button with a Yodo file tab, ADR 0056.)
- Done before: roadmap 2.10 (issue #86): shortcuts modal. A native `<dialog>` lists every shortcut in groups (Tools, Editing, View) with a search box; it opens from the editor's bottom bar, the `?` key and Home's Settings menu, and keys, clipboard and zoom gestures stay away from the drawing behind it.
- Done before: roadmap 2.7b (issue #116): SVG export (ADR 0043). The export dialog now has PNG and SVG tabs. SVG keeps scope, background, dark version and file name, drops the scale, previews the generated file, and Copy puts the source text on the clipboard. A pure renderer in `core/export/svg/` uses the rough.js generator with the canvas's seeds and options, so the wobble matches; the file embeds the fonts it uses (latin, latin-ext, cyrillic, greek, vietnamese per family) and pasted images as base64. (Since 4.9: one **Export** button with a Yodo file tab, ADR 0056.)
- Done before: roadmap 2.7c (issue #117, finishes the 2.7 split and M2): export visual baselines (ADR 0044). Three reference scenes (shapes and fills, text and labels, a mixed one) are exported as PNG and SVG in light and dark and compared with 12 committed baselines. `npm run test:visual` (and `test:visual:update`) in `e2e/` run it in the pinned Playwright Docker image, and a new CI `visual` job runs it in the same image.
- Done before: roadmap 3.1 (issue #89): folders (ADR 0045). Home has a left sidebar listing folders with icon, colour and drawing count; the **+** and ⋯ menu create, edit (name, icon, colour) and delete folders, and deleting one deletes its drawings after a confirmation that states how many. **Move to folder** is in the card menu, a new drawing made inside a folder belongs to it, and `#/f/<id>` is the folder route. Folder membership is `DrawingSummary.folderId` set by `DrawingRepository.move`; `FolderRepository` has memory, IndexedDB (db version 3) and HTTP (`/api/folders`, migration 00002) implementations on one contract suite.
- Done before: roadmap 3.2 (issue #90): Trash (ADR 0046). A drawing's card menu has **Move to Trash**; `#/trash` lists the drawings in it with Restore, Delete forever and Empty trash (both behind a confirm dialog), and the sidebar links to it with a count. Trash is `DrawingSummary.deletedAt` (`trash`, `restore`, `listTrash`, `emptyTrash` on every repository; SQLite migration 00003, `/api/drawings?trashed=true`, `PUT …/trash`). Deleting a folder now moves its drawings to Trash, and Home deletes drawings trashed over 30 days ago when it loads, in one atomic call.
- Done before: roadmap 3.3 (issue #91): search (ADR 0047). Home has a search box; while it has text, the grid becomes "In names" (cards) and "In text on the canvas" (rows with the match highlighted), sorted by the Sort by control. `DrawingRepository.searchIndex()` returns each live drawing's canvas text (computed on save by `extractSearchText`; IndexedDB v4 `search` store, SQLite migration 00004, `X-Yodo-Search-Text` header, `GET /api/search-index`, `PUT …/search-text` for long text and backfill), and `searchDrawings` in core matches it the same way in both modes.
- Done before: roadmap 3.4 (issue #92): attached arrows (ADR 0048). An arrow drawn from or to a shape stores optional `startBinding`/`endBinding` (`elementId` + box `ratio`) and keeps its real geometry, so rendering and export are unchanged. `followBindings` (`core/editor/binding.ts`) re-snaps bound ends to the shape's outline whenever `moveElements`/`resizeElements` run, when a label grows the shape, and mirrors them on a flipped resize. Moving an arrow alone detaches it; delete, duplicate, paste, `.yodo` import and the Excalidraw import keep bindings consistent. Existing arrows are re-attached by dragging an end (roadmap 4.5, ADR 0052), and free text is not a target.
- Done before: roadmap 3.5 (issue #93): card menus. A drawing card's ⋯ button and right-click open one menu with every action from `docs/ui.md`: Open, Open in new tab (a link), Rename, Duplicate (`duplicateDrawing`: saves "<name> copy" in the same folder; images are shared by hash), Move to folder, Export as .yodo and Move to Trash. The menu opens upwards, or downwards when it would leave the top of the screen (`menuPlacement.ts`). Interactions are covered by `e2e/tests/card-menu.spec.ts`.
- Done before: roadmap 3.6 (issue #94, PR #129; finishes M3): MVP e2e and release (ADR 0049). `e2e/tests/editing.spec.ts` covers text, attached arrows, move and undo/redo in both modes, and the five key flows are mapped to their specs in its header. **`v1.0.0` is released**: `ghcr.io/sonaszjojka/yodo` has `1.0.0`, `1.0` and `latest` (public; `edge` follows `main`), and a pushed `vX.Y.Z` tag on `main` publishes a release (guards refuse a tag off `main` or not the highest; release jobs queue). The README has "Two ways to use Yodo" and `docs/conventions.md` has the Releases steps.
- Done before: roadmap 4.1 (issue #131, PR #140; starts M4, post-1.0 UX fixes): drawing tools stay active (ADR 0050). The chosen tool (shapes, line, arrow, note, text, pencil) stays active after each element and the new element is not selected; `Esc` with nothing to cancel, or `V`, returns to Select. A tool picked mid-drag still wins, and a note then opens no editor. The plan for the rest of M4 is in `docs/ux-fixes-plan.md` (untracked).
- Done before: roadmap 4.2 (issue #132, PR #141): the eraser shows a circle cursor (`ui/eraserCursor.ts`, an inline SVG sized from `HIT_TOLERANCE`; `cursorFor` now lives in `ui/cursors.ts`). Dimming while dragging and the single undo step already existed. The circle is the nominal reach: a filled shape's hit box is square, so at a corner the eraser reaches a bit further (follow-up `review` issue).
- Done before: roadmap 4.3 (issue #133, PR #143): Home layout. Theme is a three-icon segmented control (System / Light / Dark, arrow keys move and select; `ui/ThemeSwitch.tsx`) in a new sidebar footer (`ui/SidebarFooter.tsx`) next to a Keyboard shortcuts button, so the Settings popover and its header row are gone. The title has its own row, then a toolbar: search on the left (max 360px), Import file and Sort by on the right, wrapping when narrow.
- Done before: roadmap 4.4 (issue #134, PR #144): free text over shapes (ADR 0051). The Text tool only edits free text under the click or starts a new one, even inside a shape or a note (`freeTextAt` in `core/editor/text.ts`). A shape's label is edited by double-click or by pressing Enter on the one selected shape or text (`Editor.editSelected`); Enter is ignored on focused buttons, links and fields (`isInteractiveControl`). Free text over a shape is its own element and does not move with the shape. Covered in `text.test.ts` and `e2e/tests/editing.spec.ts`.
- Done before: roadmap 4.5 (issue #135, PR #146): arrows attach visibly and can be re-attached (ADR 0052). A single selected arrow shows a round handle on each end instead of a box; dragging an end snaps it onto the outline of the shape under it and attaches it, or frees it over empty space (`moveEnd`, `dropEnd` in `core/editor/binding.ts`; `endpoint` gesture; one undo step). The shape an end would attach to is outlined while drawing, while dragging an end and while the Arrow tool hovers (`bindTarget`). Plain lines keep the box frame. Covered in `editor.test.ts`, `binding.test.ts` and `e2e/tests/editing.spec.ts`.
- Done before: roadmap 4.6 (issue #136, PR #147): bendable lines and arrows (ADR 0053). One selected line or arrow shows a round handle on each point instead of a box, plus a hollow mid-handle on a two-point one; dragging the mid-handle inserts a point and sets the optional `curved` flag, so the element is a Catmull-Rom curve through every point (`core/geometry/curve.ts`; hit-test, canvas and SVG render, culling and the export frame use it; Excalidraw round lines with a bend import as curved). The `endpoint` gesture now carries a point index (`HandleDrag`, `applyHandleDrag` in `core/editor/binding.ts`); each drag is one undo step. A lone line or arrow can no longer be scaled by a box. Covered in `curve.test.ts`, `editor.test.ts`, `binding.test.ts` and `e2e/tests/editing.spec.ts`. The visual export baseline has no curved scene yet (needs Docker).
- Done before: roadmap 4.7 (issue #137, PR #148): arrows attach to lines and other arrows, and arrowheads at both ends (ADR 0054, 0055). An arrow end can bind to a line or arrow with a path binding `{ elementId, along }`, the fraction of the target's drawn length (`snapToPath`, `pointAlong`, `core/editor/binding.ts`); `followBindings` resolves chains iteratively, takes an `edited` set so a point or bend drag of the target moves the attached ends in the same undo step, and detaches wrong-kind, missing or looping bindings. Arrows also get an optional `startArrowhead` and a wider `endArrowhead` with Excalidraw's 14 heads (`core/geometry/arrowhead.ts`, drawn by the canvas and the SVG export from one list; hollow heads hide the shaft with an opaque canvas-coloured fill); `Editor.setArrowhead` and Start/End head controls in the style bar and panel; the Excalidraw import maps both ends. Covered in `binding.test.ts`, `arrowhead.test.ts`, `editor.test.ts`, `StyleBar.test.tsx` and `e2e/tests/editing.spec.ts`. The e2e specs `shortcuts` (hosted-webkit) and `search` (self-hosted-chromium) are flaky under full-suite load.
- Done before: roadmap 4.8 (issue #138, PR #150): a round diamond's corner radius is now a tenth of its edge length, at most the rectangle rule (`diamondCornerRadius` in `core/geometry/rect.ts`), so it no longer reads as a rounded square (the rectangle rule cut 11% off the way to a tip at 200x200, 18% at 100x100; now at most 5%). Canvas, SVG export, hit-testing and arrow snapping share it; the `shapes` export baselines changed. No format change, no ADR. Arrows saved against the old outline re-snap when their diamond moves, resizes or is edited, not on load. Covered in `rect.test.ts`, `hit.test.ts`, `render.test.ts`, `svgScene.test.ts` and `binding.test.ts`.
- **Last done:** issue #202 (a `review` follow-up from 5.6): arrows attached to a rectangle or diamond re-snap to its new outline when its corners change in the editor, through the style bar or paste style, in the same undo step. `applyStyle` (`core/editor/style.ts`) runs `followBindings` with the shapes whose `roundness` changed as `edited`, so every caller gets it. Covered in `style.test.ts` and `editor.test.ts`.
- Done before: roadmap 5.9 (issue #186, PR #206): the MCP server ships. `npm run test:server` in `mcp/` runs all 10 tools against the real Go server with an API token, including a lost race that must get the server's 412 (CI job `mcp-server`; `startServer` in `web/test/go-server.ts` is shared with web's suite). `yodo-mcp` is publishable (only `@napi-rs/canvas` at runtime, LICENSE via `prepack`, the smoke test pins the pack list), release-please bumps its version with the app, and `npm-publish` publishes on release tags with trusted publishing, one release at a time with the tag check inside its queue (`.github/scripts/check-release-tag.sh`). README "Use Yodo from AI agents" covers Claude Code, Claude Desktop, Cursor, both modes and every tool. Still open until the first release: npm publication itself (`docs/conventions.md` Releases step 3).
- Done before: roadmap 5.8 (issue #185, PR #205): open links for the hosted app (ADR 0069). The route `#/open/<data>` carries a `.yodo` file's text, raw-deflated and base64url'd (`web/src/core/document/openLink.ts`, at most 16,384 characters, inflating capped at 50 MB). `ui/OpenLink.tsx` reads and parses it first, asks (name and element count), then imports through `importFile` and replaces the link's history entry with `#/d/<id>`; a route change during a slow import is never overwritten (`createOpener` in `ui/openLink.ts`). Bad, cut-off or over-long links show an error and store nothing. With the file backend, every MCP write result adds the `.yodo` path and a link to `YODO_APP_URL` (default the hosted app), built only from the revision the write saved (`FileDrawingRepository.exportFile`, `mcp/src/openLinks.ts`); above the limit it gives only the file. ADR 0033 lists the routes in an Amended line.
- Done before: roadmap 5.7 (issue #184, PR #203): `create_diagram` with auto-layout (ADR 0068). Agents give nodes (id, label, rectangle/diamond/ellipse, optional colours), edges (from, to, label, arrowheads) and a direction (TB, BT, LR, RL); the MCP server lays them out as a new drawing or below what an existing one has. `mcp/src/diagram/build.ts` sizes shapes to their wrapped labels (`INNER_RATIO` is now exported from `core/text/layout.ts`), binds arrows at both ends with `snapToTarget`, and places edge labels as free text beside their arrows, clear of every arrow, shape and earlier label (`clearLabel`). `layout.ts` (`layoutGraph`) is the only module that imports dagre, which is bundled and sees internal ids only. Every element passes `validate.ts` unchanged, and adding to a drawing saves at the agent's revision.
- Done before: roadmap 5.5 (issue #182, PR #198): `render_drawing` lets an agent see a drawing (ADR 0065). It returns the whole drawing, chosen element ids or a clipped region as MCP image content, light or dark: PNG through `renderExport` on `@napi-rs/canvas` (the package's first runtime dependency, kept outside the bundle), or SVG through `buildSvg`. The 16 Fontsource subsets are bundled and registered, so text is measured with canvas `measureText` as in the app. A region keeps what the renderer's `mayBeVisible` keeps, and the text beside the image maps pixels to drawing coordinates. `core/render/render.ts` no longer uses DOM types (`SceneContext`, `SceneImage`). The PNG matches the export baselines (shapes exactly, text within 1.2% of pixels). Image elements are drawn as placeholders (follow-up issue).
- Done before: roadmap 5.4 (issue #181, PR #196): a standalone file backend for the MCP server (ADR 0064). Without `YODO_URL`, the server uses `FileDrawingRepository` (`mcp/src/fileRepository.ts`), which keeps one `.yodo` file per drawing in `YODO_MCP_DIR` (default `~/Yodo`). Each file holds its metadata in a `meta` section that `parseYodoFile` strips, so files import into the app unchanged, and app exports dropped in as `<id>.yodo` are read with revision 1. File names are percent-encoded ids (lone surrogates refused). Writes go through a temp file and a rename, under one in-process queue. Trash is `.trash/`, which wins after a crash; folders are scoped out. The shared contract suite runs against it, the tool tests run over both backends, and the smoke test runs the bundle against HTTP and against files.
- Done before: roadmap 5.3 (issue #180, PR #194): the `mcp/` package and read-only MCP tools (ADR 0061). A stdio server on the v2 SDK, bundled by Vite into one `mcp/dist/index.js` (plus `THIRD_PARTY_LICENSES.md`), with `list_drawings`, `search_drawings` and `get_drawing` over `HttpDrawingRepository` with `YODO_URL` and the `YODO_API_TOKEN` bearer. Output is compact text with ids and drawn bounds; `get_drawing` lists 500 elements per call and pages with `offset`; errors are `isError` results (401 points at the token, 403 keeps the server's Host/Origin reason). An oxlint allowlist keeps imports to `web/src/core` and `web/src/storage` (no `ui/`, no `indexeddb.ts`); a CI `mcp` job runs the checks and a stdio smoke test of the bundle. New commit scope `mcp`.
- Done before: roadmap 5.2 (issue #179, PR #192): API tokens for non-browser clients (ADR 0063, extends 0020). An optional `YODO_API_TOKEN` (at least 32 token68 characters, else startup fails): a valid `Authorization: Bearer` lifts only the Origin-required rule and the password session. Host and a present Origin are checked first (403), a wrong or empty bearer gets 401 with `WWW-Authenticate: Bearer` and no cookie fallback, and other schemes are ignored. The compare is SHA-256 plus `subtle.ConstantTimeCompare` (`server/internal/server/token.go`). Behind a password, images vary on `Cookie, Authorization`.
- Done before: roadmap 5.1 (issue #178, PR #188): safe concurrent edits (ADR 0062). Drawings have an integer `revision` (migration 00005; IndexedDB summaries without one read as 1); `save(doc, { expectedRevision })` rejects with `RevisionConflictError` in every implementation, and `PUT /api/drawings/{id}` honours `If-Match: "<n>"` with `412`, the revision being the `ETag` on `GET`/`HEAD`. The auto-saver expects its last revision; on a conflict the local version goes to "‹name› (conflicted copy)" (every later save too), and the editor reloads the stored version through the `prepareReload` barrier, on conflict or on focus, with a notice and a fresh undo history.
- Done before: roadmap 5.0 (issue #177): MCP spike (ADR 0061). Research notes on the MCP 2026-07-28 spec, TS SDK v2, stdio vs Streamable HTTP, MCP Apps and the Excalidraw and Figma servers; decision: a stdio MCP server in a new `mcp/` package that imports `web/src/core` and `web/src/storage` by relative path, bundled by Vite and published to npm as `yodo-mcp` with the app's version. M5 rows 5.0–5.9 added to `docs/roadmap.md`, with packaging moved into 5.3; agents, MCP Apps and Streamable HTTP added to `docs/product.md` Later.
- Done before: roadmap 4.9 (issue #139, PR #151): one Export button (ADR 0056). The editor's top right has a single **Export** button (never disabled; Shift+Ctrl/Cmd+E) that opens the export dialog with tabs PNG / SVG / Yodo file; `ExportImageButton` is gone. The Yodo file tab has no preview or image options, a file-name field that names only the download (`exportDrawing` takes a `fileName`; the drawing keeps its own name inside the file), and Download; an empty drawing opens on it. The card menu's `Export as .yodo` is unchanged. Covered in `exportChoices.test.ts`, `yodoFile.test.ts`, `ExportButton.test.tsx` and the export e2e specs. Known: the `shortcuts` (hosted-webkit) and `search` e2e specs are flaky under full-suite load (#149).
- Open items: `review` issues from the 1.14, 1.15, 1.16, 2.2a, 2.2b and 2.3 reviews, and #118 from 2.7a.
- **Next step:** M5 is the last roadmap milestone. 5.9 stays open with npm publishing deferred (2026-11-13): `npm-publish` runs only when the repository variable `NPM_PUBLISH` is `true`, set after the owner's one-time trusted-publishing setup (`docs/conventions.md` Releases); then the next release publishes `yodo-mcp`, and its npm check ticks 5.9 and closes #186. Until then the README runs the MCP server from a clone. Next task: #199 (`render_drawing` draws real images instead of placeholders). Open: #118 (Copy and Download enabled while an image decodes), #142 (circular corner hit-testing), #149 (flaky e2e).

## Working mode: an educational project
The goal is both the app and learning how to program with Claude as effectively as possible, so that the knowledge stays with you. The rules (you decide and I explain, no silent automation, features introduced on first use, a short recap after each task, "just do it" to skip explanations) live in the global `~/.claude/CLAUDE.md` and the `educational-working-mode` memory, so they apply in every session.

---

## Part A: stages before the repositories

### Stage 0. Switch existing files to English
- Translate the project memory (`~/.claude/projects/-Users-jonaszsojka-Dev-yodo/memory/yodo-project.md`): replace "Converse in Polish" with "Communicate and write everything in English".
- Add a feedback memory with the educational working-mode rules (see Working mode above), and link it from `MEMORY.md`.
- (This plan file is already in English.)

### Stage 1. Global CLAUDE.md (~10 min)
**You provide:** your preferences on top of what we've agreed (English everywhere, educational mode, asking before commits, branches, pushes and new dependencies).
**I do:** draft a short `~/.claude/CLAUDE.md` (15–20 lines). We go through it line by line, I explain how each line changes my behavior, and I save it once you approve.

### Stage 2. Product scope (MVP)
**You provide:**
- a feature list split into **MVP / later / never**. Starting point from memory: tools (rectangle, ellipse, arrow, line, pencil, text, select/move, eraser, undo/redo), rough.js hand-drawn style, home screen with auto-saved drawings, PNG/SVG export,
- what annoys you most in Excalidraw and what you like (screenshots welcome, you can paste them into the terminal),
- who it's for: just you, or other users with login some day.

**I do:** `docs/product.md` with the goal, the MVP with "done when…" criteria, and an out-of-scope list.

### Stage 3. Technical decisions
Done. Settled: frontend, rendering, storage in both usage modes, distribution, auth, Go server stack, SQL tooling, tests, repo layout and the drawing format. The outcomes are in `docs/adr/README.md`; the ADRs replace the original agenda that stood here.

**You provide:** what you want to learn or show in your portfolio (this strongly shapes the choices), and technologies you already know.
**I do:** one ADR per decision in `docs/adr/` (Nygard format + alternatives; see ADR 0001).

### Stage 4 (optional). UI mockup
A quick mockup in Claude Design (artifact) to settle the home screen and toolbar layout before writing code.
**You provide:** inspirations and preferences (minimalism, colors, dark mode).

### Stage 5. Roadmap in small tasks
**I do:** split the MVP into milestones and tasks of about one session each (e.g. "canvas + drawing a rectangle", "selecting and moving", "undo/redo", "saving to IndexedDB", "Go server serving the app", "SQLite storage behind the HTTP repository"…). Each task has a "done when…" criterion. Once the repo exists, they can become GitHub Issues.
The roadmap must cover both usage modes (ADR 0005–0008): the Go server, SQLite, the Docker image and the GitHub Pages deploy belong in M1, not in a later stage.

### Stage 6. Working conventions (you decide, I explain the options)
For each point I show examples and explain how teams handle it in practice:
- **commit format:** e.g. Conventional Commits (`feat: add rectangle tool`) versus free-form messages; whether to add `Co-Authored-By: Claude`,
- **branch naming:** e.g. `feat/rectangle-tool`, `fix/undo-crash`; a branch per task, or working directly on `main`,
- **flow:** PR + `/code-review` before merge (good practice and looks good in a portfolio), or local merges,
- **who does what in git:** I suggest that I prepare each commit (message + diff) and you approve it; push and merge only on your command,
- **definition of done:** tests pass, lint is clean, the change has been checked in the browser (screenshot).
- **license:** the repo is public and meant for self-hosting, so pick one (e.g. MIT, Apache-2.0, AGPL-3.0).

The result goes into `docs/conventions.md`, and later into the project CLAUDE.md.

---

## Part B: creating the repo (after stages 1–6; every step explained and done only with your approval)
1. `git init` in `~/Dev/yodo` (it becomes the monorepo, `docs/` is already in place) and `gh repo create sonaszjojka/yodo --public` (public is required for free GitHub Pages, ADR 0007). Scaffold `web/` (Vite + React + TS) and `server/` (Go module) per ADR 0012. I explain what the scaffold generates and what each file is for.
2. Working `npm run dev`, `npm test`, `go test ./...`, `sqlc generate`, lint and formatters for both TypeScript and Go.
3. `/init`, then extend the project CLAUDE.md with the decisions and conventions from stages 3 and 6, including the rule to record every architectural decision as an ADR.
4. Claude configuration: a format-on-edit hook, an allowlist of safe commands (`/fewer-permission-prompts` after a few days). CI in GitHub Actions with path filters for `web/` and `server/`, the GitHub Pages deploy and the Docker image push to GHCR (ADR 0007).
5. Skills only once something repeats (candidates: `run` to launch the app and take a screenshot, `add-tool` for adding a new canvas tool). Deliberate exception: the workflow skills (`feature`, `fix`, `commit`, `ship`, `adr`) were written in Stage 6 because the flow was already decided; adjust them after the first few tasks.

---

## Part C: how Claude works best (cheat sheet)

| Situation | What you give me | What you get |
|---|---|---|
| Session start | one goal for the session ("today: undo/redo") | focused work that doesn't drift |
| New feature | a "done when…" criterion, an example or screenshot, constraints | a plan (plan mode, `Shift+Tab`), then after approval code + test + verification |
| Bug | repro steps, expected vs. actual behavior, error or screenshot | a diagnosis of the cause, a fix, and a test that catches it |
| Visual work | a screenshot or reference pasted into the terminal | a change checked in the browser |
| Correction | a concrete "not X, because Y" | it's remembered for future sessions |

Session hygiene:
- `/clear` between unrelated tasks, because stale context gets in the way,
- plan mode for anything bigger than a small fix,
- one terminal with Claude, a second one for the dev server; parallel sessions and worktrees only once frontend and backend work run in parallel,
- lasting knowledge goes into files (`docs/`, CLAUDE.md), not only into the conversation.

---

## Part D: sessions, context and commands (quick reference)

**The task loop:** `/clear` → state one goal → plan mode (`Shift+Tab`) → approve the plan → implement → verify → review the diff (`git diff` / IDE) → commit → `/clear`.

| When | Use |
|---|---|
| Starting a new, unrelated task | `/clear` (default choice; CLAUDE.md and memory reload) |
| Mid-task, context getting full | `/compact <what to keep>` |
| Checking how full the context is | `/context` |
| Coming back after closing the terminal | `claude -c` (last session) or `claude --resume` / `/resume` |
| I went the wrong way | `Esc` to stop, `Esc Esc` / `/rewind` to go back to an earlier point |
| Switching mode (normal / accept edits / plan) | `Shift+Tab` |
| Pointing at a file / showing a screenshot | `@path/to/file` / paste the image |
| Running a shell command into the conversation | `! command` |
| Editing what I remember | `/memory` |
| Seeing diffs in the editor | `/ide` (VS Code / JetBrains) |

Signs it's time to `/clear`: the task is done, I repeat a mistake you already corrected, or I "forget" earlier instructions.

Multiple sessions: one main session plus a second for side questions or research, so the main context stays clean. Parallel coding sessions only with separate git worktrees, once frontend and backend work run in parallel.

---

## Verification
Preparation is finished when these exist: an English project memory plus a working-mode feedback memory, a global CLAUDE.md, `docs/product.md` (MVP with criteria), ADRs in `docs/adr/` (stack + storage + reasoning), a roadmap with the first 5–10 tasks, and written conventions. Then we move on to Part B.

---

## History
Finished stages and tasks are logged, oldest first, in `docs/history.md`. `/ship` appends there.
