# Yodo — Roadmap

> Status: **approved 2026-10-30** (Stage 5 of `docs/plan.md`). Splits the MVP in `docs/product.md` into milestones and tasks of about one session each. Each task has a "done when…" criterion on top of the definition of done in `docs/conventions.md`. M0 and M1 tasks are GitHub Issues (linked after each task name; done tasks link the PR that shipped them) grouped in milestones M0–M3; M2 and M3 issues are created when M1 ends. This file keeps the order and the milestone split.

## Ordering principle: walking skeleton first
M0 builds a thin end-to-end path through every part of the system (web app, Go server, SQLite, Docker image, Pages deploy, CI) before any feature work. Integration risks (Vite `base`, hash routing, `go:embed`, CI path filters) show up on day one, and from then on every task ships to a live URL. Features are added as vertical slices on top.

## M0 — Walking skeleton (= Part B of `docs/plan.md`)
| # | Task | Done when… |
|---|---|---|
| 0.1 | Repo + scaffold ✓ (PR [#1](https://github.com/sonaszjojka/yodo/pull/1)) | `sonaszjojka/yodo` exists with `web/` (Vite + React + TS strict) and `server/` (Go module) laid out per ADR 0012; `npm run dev` shows a placeholder page with the logo. |
| 0.2 | Tooling ✓ ([#6](https://github.com/sonaszjojka/yodo/issues/6)) | Format for TS and Go, lint for Go (TS lint: oxlint, ADR 0016), `npm test` and `go test ./...` each run one passing test, `sqlc generate` runs on an empty schema. Project CLAUDE.md via `/init`, extended with ADR rule + conventions. |
| 0.3 | CI + Pages deploy ✓ ([#7](https://github.com/sonaszjojka/yodo/issues/7)) | GitHub Actions runs web and server jobs with path filters; merging to `main` deploys the placeholder to `sonaszjojka.github.io/yodo/` (ADR 0007). |
| 0.4 | Go server + Docker image ✓ ([#8](https://github.com/sonaszjojka/yodo/issues/8)) | `server` embeds `dist/` and serves it with hash routing; `/api/health` returns 200; multi-stage `Dockerfile` builds an image pushed to GHCR; the documented `docker run` command shows the placeholder. |
| 0.5 | Server security baseline ✓ ([#9](https://github.com/sonaszjojka/yodo/issues/9)) | Host/Origin middleware per ADR 0020 (`YODO_ALLOWED_ORIGINS`), table-driven tests for allowed/blocked/missing-Origin cases. |

## M1 — Draw and keep it (both usage modes)
Goal: open Yodo, draw basic shapes, close the browser, come back to the same drawing listed on Home, in hosted and self-hosted mode.

| # | Task | Done when… |
|---|---|---|
| 1.1 | Document model + migrations skeleton ✓ (PR [#34](https://github.com/sonaszjojka/yodo/pull/34)) | `web/src/core` defines the v1 document (ADR 0013) and element types; `migrate()` runs on load and is tested with a fixture. |
| 1.2 | Canvas + rectangle ✓ (PR [#35](https://github.com/sonaszjojka/yodo/pull/35)) | Full-window canvas, HiDPI-sharp; click-drag draws a rough.js rectangle with a fixed per-element seed; Shift keeps it square. **ADR:** frontend state management (open item from Stage 3). |
| 1.3 | Pan + zoom ✓ (PR [#36](https://github.com/sonaszjojka/yodo/pull/36)) | Hand tool / Space-drag / wheel pans; pinch / Ctrl+wheel zooms around the cursor; zoom % shown and resettable. Screen↔world transforms unit-tested. |
| 1.4 | Diamond, ellipse, line, arrow ✓ (PR [#38](https://github.com/sonaszjojka/yodo/pull/38)) | Each tool draws at the dragged size; Shift constrains; arrowhead on arrow. Hit-testing for every shape unit-tested. |
| 1.5 | Selection ✓ (PR [#39](https://github.com/sonaszjojka/yodo/pull/39)) ([#14](https://github.com/sonaszjojka/yodo/issues/14)) | Click, Shift+click, box select; selection outline + handles per `docs/ui.md`; move and Delete. |
| 1.6 | Resize ([#15](https://github.com/sonaszjojka/yodo/issues/15)) | Corner/edge handles resize one or many elements; Shift keeps proportions; size badge shown. |
| 1.7 | Undo / redo ([#16](https://github.com/sonaszjojka/yodo/issues/16)) | Every change from 1.2–1.6 undoes/redoes with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z. **ADR:** undo/redo design (open item from Stage 3). |
| 1.8 | Pencil ([#17](https://github.com/sonaszjojka/yodo/issues/17)) | Freehand strokes are smooth, selectable and movable as one element. |
| 1.9 | Text ([#18](https://github.com/sonaszjojka/yodo/issues/18)) | Click places a text box; double-click edits; text inside shapes. |
| 1.10 | Eraser + tool shortcuts ([#19](https://github.com/sonaszjojka/yodo/issues/19)) | Dragging erases (undoable); every tool so far has a single-key shortcut; editor toolbar per `docs/ui.md`. |
| 1.11 | Repository interface + IndexedDB ([#20](https://github.com/sonaszjojka/yodo/issues/20)) | `DrawingRepository` + `InMemory` and `IndexedDb` implementations pass one shared contract suite (ADR 0005, 0011). |
| 1.12 | SQLite + HTTP API ([#21](https://github.com/sonaszjojka/yodo/issues/21)) | goose migration for `drawings`, sqlc queries, CRUD handlers with `httptest` tests on a temp SQLite file (ADR 0006, 0009, 0010). |
| 1.13 | HTTP repository + mode detection ([#22](https://github.com/sonaszjojka/yodo/issues/22)) | `HttpDrawingRepository` passes the same contract suite against a running server; app picks HTTP if `/api/health` answers, otherwise IndexedDB. |
| 1.14 | Auto-save ([#23](https://github.com/sonaszjojka/yodo/issues/23)) | Changes save debounced, with save status in the bottom bar; reload restores the drawing in both modes. |
| 1.15 | Home screen ([#24](https://github.com/sonaszjojka/yodo/issues/24)) | Card grid with thumbnail, name, last edited; "+ New drawing" tile; open, rename; sort by recent/name/created. Hash routes `#/` and `#/d/:id`. |
| 1.16 | M1 e2e ([#25](https://github.com/sonaszjojka/yodo/issues/25)) | Playwright: draw → reload → open from Home, in hosted and self-hosted mode (ADR 0011). |

## M2 — Style, share, move between tools
| # | Task | Done when… |
|---|---|---|
| 2.1 | Contextual style bar | Stroke, fill, width, look (hand-drawn/clean) above the selection, per `docs/ui.md`. |
| 2.2 | Style panel | Movable, resizable panel with the full section list; edits defaults when nothing is selected; agrees with the bar. |
| 2.3 | Dark mode | UI + canvas themes; choice remembered; drawing colours dark-adapted at render time (ADR 0015). |
| 2.4 | Sticky notes | Coloured note with text: place, move, resize, edit. |
| 2.5 | Copy / paste / duplicate | Elements copy and paste within and between drawings; duplicate; select all. |
| 2.6 | Images | Pasted images appear on canvas; blobs stored by content hash in IndexedDB and under `/data` (ADR 0013). |
| 2.7 | Export PNG / SVG | Export dialog: whole drawing or selection, background on/off, dark version, PNG scale; copy or download. Visual regression baseline for a few scenes. |
| 2.8 | `.yodo` export / import | Export inlines images as base64; import recreates the drawing exactly, also from an older-version fixture. |
| 2.9 | Excalidraw import | Converter for shapes, text, arrows, pencil, images; summary of skipped features (ADR 0014). |
| 2.10 | Shortcuts modal | Searchable, grouped list of every shortcut. |
| 2.11 | Optional password | `YODO_PASSWORD` + session cookie + password screen (ADR 0020); tests for locked/unlocked/wrong password. |
| 2.12 | Performance benchmark | Playwright perf test on the generated reference board (`docs/product.md`); results recorded, tracked over time. Fix anything below target. |

## M3 — Organise
| # | Task | Done when… |
|---|---|---|
| 3.1 | Folders | Create, rename, delete folders with icon + colour picker; move drawings into folders; sidebar list. Works in both modes. |
| 3.2 | Trash | Delete moves to Trash; restore, delete forever, empty with confirm. |
| 3.3 | Search | Finds drawings by name and canvas text (`search_text`, ADR 0013); results split as in `docs/ui.md`. |
| 3.4 | Attached arrows | Arrows bound to shapes follow when either shape moves or resizes. |
| 3.5 | Card menus | ⋯ and right-click menu with every action from `docs/ui.md` (duplicate, open in new tab, export, …). |
| 3.6 | MVP e2e + release | Playwright covers the 3–5 key flows in both modes; tagged `v1.0.0` image on GHCR; README documents both usage modes. |

## Rules for changing this roadmap
- Tasks may be split, merged or reordered; record why in the commit message.
- A task that turns out bigger than one session is split before continuing.
- Anything new goes to `docs/product.md` "Later" first, not straight into a milestone.
