# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Yodo is a local-first, Excalidraw-like drawing app. It's a monorepo (ADR 0012): `web/` (React + Vite + TS), `server/` (Go), `e2e/` (Playwright), `docs/`. The project is early: `docs/roadmap.md` lists what exists and what's next, and `docs/plan.md` has the current status.

## Commands
Node 26 (`web/.nvmrc`, `nvm use`), Go 1.27. golangci-lint 2.15 is a separate binary (`brew install golangci-lint`), and sqlc is pinned in `server/go.mod` and runs via `go tool` (ADR 0017).

**web/** (run from `web/`)
| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Tests | `npm test` (Vitest, single run) · one file: `npx vitest run src/path/file.test.ts` · one test: `npx vitest run -t "name"` |
| Server contract tests | `npm run test:server` (needs Go: builds and starts the server, ADR 0031) |
| Lint | `npm run lint` (oxlint, ADR 0016) |
| Format | `npm run format` · check: `npm run format:check` (Prettier, no semicolons, single quotes) |
| Type-check + build | `npm run build` (`tsc -b && vite build`) |

**server/** (run from `server/`)
| Task | Command |
|---|---|
| Tests | `go test ./...` · one test: `go test ./internal/server -run TestName` |
| Lint | `golangci-lint run` |
| Format | `golangci-lint fmt` · check: `golangci-lint fmt --diff` (gofmt + goimports) |
| Generate SQL code | `go tool sqlc generate` (commit the output in `internal/db/`) |
| Run | `go run ./cmd/yodo` (listens on `YODO_ADDR`, default `127.0.0.1:8080`; database in `YODO_DATA_DIR`, default `./data`) |

**e2e/** (run from `e2e/`; needs Node, Go and `npx playwright install` once, ADR 0035)
| Task | Command |
|---|---|
| Tests | `npm test` (builds web and server, then runs every project) · one project: `npx playwright test --project self-hosted-chromium` (reuses the last build) |
| Lint / format / type-check | `npm run lint` · `npm run format:check` · `npm run typecheck` |
| Performance benchmark | `npm run perf` (on demand, headed system Chrome; `PERF_RECORD=1` appends to `docs/perf/results.jsonl`; ADR 0042, `docs/perf/README.md`) |
| Export visual baselines | `npm run test:visual` · update after a deliberate rendering change: `npm run test:visual:update`, then review the image diff (needs Docker; runs in the pinned Playwright image, same as CI's `visual` job; ADR 0044) |

**Docker image** (run from the repo root): `docker build -t yodo .`, then `docker run -p 127.0.0.1:8080:8080 -v yodo-data:/data yodo`. The build copies `web/dist` into `server/internal/webui/dist/` for `go:embed` (ADR 0019).

Before calling a task done, run the test, lint, format-check and type-check commands for every part that changed (definition of done, `docs/conventions.md`).

## Architecture (see `docs/adr/README.md` for the full index)
- **Two usage modes, one frontend.** *Hosted* is a static build on GitHub Pages that stores drawings in IndexedDB (ADR 0005). *Self-hosted* is a Docker image where the Go server serves the same build and stores drawings in SQLite (ADR 0006, 0007). The app picks the mode at startup by probing `api/health` (ADR 0031). The build uses `base: './'` so it works under `/yodo/` and `/`.
- **Framework-free core.** `web/src/core/` (document model, geometry, hit-testing, undo/redo) must not import React; `web/src/ui/` is the React shell (ADR 0002). Rendering is Canvas 2D + rough.js, with a fixed seed per element (ADR 0004); pencil strokes are a plain smoothed Canvas path instead (ADR 0024).
- **Storage behind one interface.** All data access goes through `DrawingRepository` in `web/src/storage/` (may import `core/`, never `ui/`; ADR 0029), which has an IndexedDB implementation and an HTTP implementation. One shared contract test suite runs against both (ADR 0005, 0011). Image blobs go through `ImageRepository`, keyed by content hash, with the same pattern (ADR 0040).
- **Attached arrows** are optional `startBinding`/`endBinding` (`elementId` + box `ratio`) on an arrow; the arrow keeps real geometry, and `followBindings` in `web/src/core/editor/binding.ts` re-snaps bound ends whenever `moveElements`/`resizeElements` run (ADR 0048). An end can also attach to a line or another arrow at a fraction `along` of its drawn length (`{ elementId, along }`, `snapToPath`; ADR 0054), and `followBindings` resolves chains in order. Delete, duplicate, paste, file import and the Excalidraw import keep bindings consistent. Dragging an end of a single selected arrow re-attaches or detaches it (ADR 0052, `moveEnd`/`dropEnd`). Arrows can have a head at either end, one of 14 shapes (`startArrowhead`/`endArrowhead`, `core/geometry/arrowhead.ts`, `Editor.setArrowhead`; ADR 0055). A single selected line or arrow shows point handles instead of a box; a two-point one has a mid-handle that bends it, and an optional `curved` flag makes a line or arrow a Catmull-Rom curve through its points (ADR 0053, `core/geometry/curve.ts`).
- **Safe concurrent saves** (ADR 0062): `DrawingSummary.revision` counts saves (move/trash/restore don't); `save(doc, { expectedRevision })` rejects with `RevisionConflictError` on a mismatch, atomically in every implementation; over HTTP it's `If-Match: "<n>"` → `412`, with the revision as the `ETag` on `GET`/`HEAD`. The auto-saver expects its last revision; on a conflict it switches to a conflicted copy for every later save, and the editor reloads the stored version only through `prepareReload` (`web/src/storage/drawings.ts`), on conflict or on focus.
- **Folders** are metadata outside the document: `DrawingSummary.folderId`, set with `DrawingRepository.move`, plus a `FolderRepository` with the same contract-suite pattern. Deleting a folder moves its drawings to Trash (ADR 0046). Home's `#/f/<id>` route filters by folder.
- **Trash** is `DrawingSummary.deletedAt`, set by `DrawingRepository.trash` and cleared by `restore`; `list()` returns live drawings only, `listTrash()` the rest, and `emptyTrash({ deletedBefore })` deletes atomically. Home sweeps drawings trashed over 30 days ago when it loads; the route is `#/trash` (ADR 0046).
- **Search** is an index in the repository, matched on the client (ADR 0047): `DrawingRepository.searchIndex()` returns each live drawing's canvas text (`extractSearchText` in `web/src/core/search/`, computed on save); `searchDrawings` matches it in both modes. IndexedDB keeps it in a `search` store; the server keeps `drawings.search_text`, set from the `X-Yodo-Search-Text` header on `PUT /api/drawings/{id}`, with `PUT …/search-text` for long text and backfill, and `GET /api/search-index`.
- **Document format.** Drawings are a versioned JSON document (`schemaVersion` plus migrations). The server stores it as opaque JSON and never parses elements (ADR 0013). A breaking format change needs a version bump and a migration; an optional field doesn't (ADR 0013).
- **Server.** Stdlib `net/http` (ADR 0009); SQLite via the pure-Go modernc driver, sqlc-generated queries from `queries/`, and goose migrations in `migrations/` embedded and applied at startup (ADR 0010). The drawings API under `/api/drawings` mirrors `DrawingRepository` (ADR 0030); `/api/images/{hash}` stores image files under `<YODO_DATA_DIR>/images` (ADR 0040). Auth: none in hosted mode; localhost-only plus optional `YODO_PASSWORD` when self-hosted, and every request passes Host/Origin checks against `YODO_ALLOWED_ORIGINS` (ADR 0020).
- **Text** is either a free `text` element or a shape's `label` (ADR 0026), edited in a textarea over the canvas (ADR 0027). The text tool only makes free text; a label is edited by double-click or Enter on the selected shape (ADR 0051). Layout is a pure core function with an injected `measure`; fonts are Fontsource packages (ADR 0025).
- **Export.** PNG export draws the scene again with `renderScene` on an offscreen canvas at the chosen scale and theme (ADR 0041); the pure parts are in `web/src/core/export/`. SVG export is a second, pure path in `web/src/core/export/svg/`: it builds an SVG from the rough.js generator with the same seeds and options, and embeds the fonts it uses (ADR 0043).
- **Colours** are stored as light-theme values and adapted when rendering in dark mode (ADR 0015).
- **CI and releases.** `.github/workflows/ci.yml` runs the same commands as above, filtered by path, and publishes the Docker image: `edge` from `main`, and `X.Y.Z`, `X.Y` plus `latest` on a `vX.Y.Z` tag (ADR 0049). The hosted app deploys to Pages from that tag too, not on merge to `main` (ADR 0057). release-please keeps a release PR open from Conventional Commits; merging it creates the tag and `CHANGELOG.md` entry (ADR 0058), and release images are signed with cosign (ADR 0060). Other workflows: `pr-title` (Conventional Commit PR titles), `codeql`, `scorecard`, `stale`; Dependabot updates dependencies weekly. Required checks on `main`: `ci`, `conventional-title`, `analyze (go)` and `analyze (javascript-typescript)`. A new job in `ci.yml` must be added to the `ci` job's `needs`; a check from another workflow must be added to the ruleset "Protect main" instead. Actions are pinned by commit SHA (ADR 0018).
- **Tests** follow the pyramid in ADR 0011: Vitest for core and UI, `httptest` against a real temp SQLite file for Go, and a few Playwright e2e and visual tests.

## Rules
- **Every architectural decision gets an ADR** in `docs/adr/` (template `0000-template.md`, then add a row to the index). Never rewrite an accepted ADR: write a new one and mark the old one `Superseded by NNNN`. Use `/adr`.
- Roadmap tasks flagged `needs-adr` need their ADR before implementation.
- Follow `docs/conventions.md`: Conventional Commits (scopes `web`, `server`, `e2e`, `docs`, `ci`, `deps`), **no AI attribution trailers**, but **every commit is signed off** with `git commit -s`, Claude's included (DCO, ADR 0059; see `CONTRIBUTING.md`), one branch per task (`feat/<id>-<slug>`), and PRs squash-merged into protected `main`. The owner approves commits, pushes, PRs and merges.
- UI work follows `docs/ui.md`; product scope and done-when criteria are in `docs/product.md` and `docs/roadmap.md`.
- Workflow skills in `.claude/skills/`: `/feature`, `/fix`, `/retest`, `/commit`, `/ship`, `/adr`, and `/deliver` (the full cycle via Orca, with Codex reviewing the plan and the code and retesting in a browser with Playwright; ADR 0037). Shared skills for every agent are in `.agents/skills/`; Codex reads `AGENTS.md`.
