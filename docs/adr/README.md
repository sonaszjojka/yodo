# Architecture Decision Records

Why Yodo is built the way it is. See [0001](0001-record-architecture-decisions.md) for the rules.

## Writing a new ADR
1. Copy `0000-template.md` to the next free number, e.g. `0006-short-title.md`.
2. Start as `Proposed`; set `Accepted` once decided.
3. Never rewrite an accepted ADR. To change a decision, write a new ADR and mark the old one `Superseded by NNNN`. Typo fixes and clarifications are allowed in place with an `Amended:` line.
4. Add it to the index below.

## Index
| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as ADRs | Accepted |
| [0002](0002-frontend-react-typescript-vite.md) | React + TypeScript + Vite, framework-free core | Accepted |
| [0003](0003-distribution-github-pages-and-docker.md) | GitHub Pages + Docker image (nginx) | Superseded by 0007 |
| [0004](0004-rendering-canvas-2d-roughjs.md) | Canvas 2D + rough.js rendering | Accepted |
| [0005](0005-browser-storage-indexeddb.md) | IndexedDB via `idb` in hosted mode, repository interface | Accepted |
| [0006](0006-self-hosted-storage-go-sqlite.md) | Self-hosted storage: Go server + SQLite | Accepted |
| [0007](0007-distribution-pages-and-docker-go-server.md) | GitHub Pages + Docker image with Go server | Accepted |
| [0008](0008-auth-none-hosted-optional-password-self-hosted.md) | Auth: none hosted; localhost + optional password self-hosted | Superseded by [0020](0020-auth-and-origin-checks.md) |
| [0009](0009-go-http-standard-library.md) | Go HTTP: standard library `net/http` | Accepted |
| [0010](0010-sql-sqlc-modernc-sqlite-goose.md) | SQL: sqlc + modernc SQLite + embedded goose | Accepted |
| [0011](0011-testing-strategy.md) | Testing: pyramid + repository contract + few e2e/visual | Accepted |
| [0012](0012-monorepo.md) | One repository `sonaszjojka/yodo` (monorepo) | Accepted |
| [0013](0013-drawing-document-format-and-versioning.md) | Versioned drawing document, opaque JSON on the server | Accepted |
| [0014](0014-import-excalidraw-files.md) | Import `.excalidraw` files via a one-way converter | Accepted |
| [0015](0015-store-light-colours-adapt-in-dark-mode.md) | Store light colours, adapt them when rendering dark | Accepted |
| [0016](0016-typescript-lint-oxlint.md) | Lint TypeScript with oxlint | Accepted |
| [0017](0017-formatting-go-lint-and-go-tools.md) | Prettier + gofmt, golangci-lint, Go tools via `go tool` | Accepted |
| [0018](0018-ci-github-actions-gate-job.md) | CI: one workflow, path filters, `ci` gate job | Accepted (Pages deploy on merge superseded by [0057](0057-deploy-the-hosted-app-from-release-tags.md)) |
| [0019](0019-docker-image-build-and-publishing.md) | Docker image: dist copied into the Go package, distroless, multi-arch from `main` | Superseded by 0049 (publishing only) |
| [0020](0020-auth-and-origin-checks.md) | Auth as 0008, plus check `Origin` whenever present and deny unlisted methods | Accepted |
| [0021](0021-frontend-state-external-store.md) | Editor state in a framework-free store, read by React via `useSyncExternalStore` | Accepted |
| [0022](0022-viewport-is-editor-state.md) | Viewport lives in editor state; pans and zooms are not document changes | Accepted |
| [0023](0023-undo-redo-document-snapshots.md) | Undo/redo with snapshots of the immutable document | Accepted |
| [0024](0024-pencil-strokes-smoothed-canvas-path.md) | Pencil strokes drawn as a smoothed Canvas path, not with rough.js | Accepted |
| [0025](0025-ship-fonts-with-fontsource.md) | Fonts as Fontsource npm packages bundled by Vite | Accepted |
| [0026](0026-shape-text-as-label-field.md) | Text inside a shape is a `label` field on the shape | Accepted (text-tool clause superseded by [0051](0051-text-tool-always-creates-free-text.md)) |
| [0027](0027-edit-text-in-textarea-overlay.md) | Edit text in an HTML textarea over the canvas | Accepted |
| [0028](0028-ui-icons-phosphor-react.md) | UI icons from the `@phosphor-icons/react` package | Accepted |
| [0029](0029-storage-layer-in-web-src-storage.md) | Storage code in its own `web/src/storage` layer | Accepted |
| [0030](0030-drawings-http-api.md) | Drawings HTTP API: REST routes that mirror `DrawingRepository` | Accepted |
| [0031](0031-storage-mode-detection-and-server-contract-tests.md) | Pick the storage mode with a health probe; run the contract suite against a real server | Accepted |
| [0032](0032-auto-save-debounced-serialized.md) | Auto-save: debounced, one save at a time, flushed when the page hides | Accepted |
| [0033](0033-hash-routes-and-drawing-load-errors.md) | Hash routes via a small own hook; a drawing that fails to load shows an error, not a blank drawing | Accepted |
| [0034](0034-render-thumbnails-on-home.md) | Render Home thumbnails from the documents, lazily, with the scene renderer | Accepted |
| [0035](0035-e2e-playwright-package-both-modes.md) | E2E: Playwright in `e2e/`, both modes served from one build, three browsers | Accepted |
| [0036](0036-style-defaults-and-panel-as-browser-preferences.md) | Style defaults and the style panel's place are per-browser preferences in `localStorage`, outside the document | Accepted |
| [0037](0037-orca-deliver-pipeline-with-codex-review.md) | Deliver features through an Orca pipeline with Codex reviewing the plan and code and retesting in a browser | Accepted |
| [0038](0038-sticky-notes-as-note-element.md) | Sticky notes are a `note` element with a label, a fixed default colour and a clean look | Accepted |
| [0039](0039-copy-paste-through-the-system-clipboard.md) | Copy and paste elements through the system clipboard with a validated JSON payload | Accepted |
| [0040](0040-images-in-a-content-addressed-image-repository.md) | Images are `image` elements backed by a content-addressed `ImageRepository` (IndexedDB blobs, `/api/images` and files under `/data`) | Accepted |
| [0041](0041-export-images-by-re-rendering-on-an-offscreen-canvas.md) | Export PNG by re-rendering the scene on an offscreen canvas at the chosen scale, theme and background | Accepted |
| [0042](0042-performance-benchmark-on-demand-results-in-git.md) | Track performance with an on-demand Playwright benchmark whose results are committed as JSONL | Accepted |
| [0043](0043-export-svg-with-a-parallel-pure-svg-renderer.md) | Export SVG with a parallel pure SVG renderer (rough.js generator, same seeds) and embedded fonts | Accepted |
| [0044](0044-export-visual-regression-baseline.md) | Guard the export with visual baselines made and checked in one pinned Playwright image | Accepted |
| [0045](0045-folders-as-metadata-with-a-folder-repository.md) | Folders are metadata outside the document, behind a `FolderRepository` | Accepted |
| [0046](0046-trash-as-a-deleted-at-timestamp-on-the-summary.md) | Trash is a `deletedAt` timestamp on the drawing summary; folder delete trashes; 30-day client-side purge | Accepted |
| [0047](0047-search-index-in-the-repository-matched-on-the-client.md) | Search: an index in the repository (`searchIndex()`, `X-Yodo-Search-Text` header), matched on the client | Accepted |
| [0048](0048-attached-arrows-as-bindings-on-the-arrow.md) | Attached arrows: optional `startBinding`/`endBinding` (`elementId` + box `ratio`) on the arrow, geometry kept in sync | Accepted (re-attaching clause superseded by [0052](0052-arrow-endpoint-handles-and-reattaching.md)) |
| [0049](0049-releases-semver-tags-publish-the-image.md) | Releases: a semver tag on `main` publishes the versioned image; `latest` is the newest release, `edge` is `main` | Accepted (manual tag and Release steps superseded by [0058](0058-release-please-for-versions-and-changelog.md)) |
| [0050](0050-drawing-tools-stay-active.md) | Drawing tools stay active after each element; `Esc` or `V` returns to Select; the new element is not selected | Accepted |
| [0051](0051-text-tool-always-creates-free-text.md) | The text tool always creates free text; labels are edited with the Select tool (double-click or Enter); amends 0026 | Accepted |
| [0052](0052-arrow-endpoint-handles-and-reattaching.md) | Arrow endpoint handles: drag an end of a selected arrow to attach or detach it; the target shape is highlighted; amends 0048 | Accepted (selection clauses amended by [0053](0053-bendable-lines-and-arrows.md)) |
| [0053](0053-bendable-lines-and-arrows.md) | Bendable lines and arrows: optional `curved` flag + extra points, a Catmull-Rom curve through every point; amends 0052 | Accepted |
| [0054](0054-arrows-attach-to-lines-and-arrows.md) | Arrows attach to lines and arrows: a path binding `{ elementId, along }` (fraction of the drawn length); partly supersedes 0048 | Accepted |
| [0055](0055-arrowheads-at-both-ends.md) | Arrowheads at both ends of an arrow: `startArrowhead`, 14 heads from Excalidraw's set, edited from the style bar | Accepted |
| [0056](0056-one-export-button-with-a-yodo-file-tab.md) | One Export button: the export dialog gets a Yodo file tab next to PNG and SVG | Accepted |
| [0057](0057-deploy-the-hosted-app-from-release-tags.md) | Deploy the hosted app from release tags; `main` is an integration branch; `release/X.Y` for old-line hotfixes | Accepted |
| [0058](0058-release-please-for-versions-and-changelog.md) | release-please picks versions, writes the changelog and tags releases | Accepted |
| [0059](0059-developer-certificate-of-origin-instead-of-a-cla.md) | Require a DCO sign-off instead of a CLA | Accepted |
| [0060](0060-sign-release-images-and-attach-provenance.md) | Sign release images with cosign (keyless); attach provenance and an SBOM; run OpenSSF Scorecard | Accepted |
| [0061](0061-mcp-server-as-a-typescript-package-in-mcp.md) | MCP server as a TypeScript package in `mcp/`: stdio, SDK v2, relative imports of core/storage, Vite bundle, npm `yodo-mcp` | Accepted |
| [0062](0062-revision-counter-and-if-match-for-safe-concurrent-saves.md) | Safe concurrent saves: an integer `revision` per drawing, `If-Match` on `PUT` with `412` on a mismatch, conflicted copies in the editor; extends 0030 | Accepted |
| [0063](0063-api-token-for-non-browser-clients.md) | Optional `YODO_API_TOKEN`: a valid bearer token lifts the `Origin`-required rule and the password session; `Host` and a present `Origin` still checked; extends 0020 | Accepted |
| [0064](0064-file-backend-for-the-mcp-server.md) | MCP file backend: one `.yodo` file per drawing with a `meta` section, atomic temp-file writes, Trash as `.trash/`, folders scoped out, `~/Yodo` default; extends 0061 | Accepted |
| [0065](0065-render-drawings-in-node-with-napi-rs-canvas.md) | MCP rendering with `@napi-rs/canvas`: canvas `measureText` with the bundled Fontsource fonts, PNG through `renderExport`, SVG through `buildSvg`; first runtime dependency of `yodo-mcp`; extends 0061 | Accepted |
| [0066](0066-agent-element-spec-for-mcp-write-tools.md) | MCP write tools take a compact agent element spec (absolute points, plain-string labels, optional agent ids, bindings only through `connect`), checked by `validate.ts` and saved with `If-Match`; extends 0061 | Accepted |
| [0067](0067-cross-process-write-lock-for-the-mcp-file-backend.md) | MCP file backend: writes hold a short `<dir>/.lock` (exclusive create, stale after a dead pid or 30 s, released only by its owner), so two processes can't lose a save; extends 0064 | Accepted |
