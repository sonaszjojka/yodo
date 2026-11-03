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
| [0018](0018-ci-github-actions-gate-job.md) | CI: one workflow, path filters, `ci` gate job | Accepted |
| [0019](0019-docker-image-build-and-publishing.md) | Docker image: dist copied into the Go package, distroless, multi-arch from `main` | Accepted |
| [0020](0020-auth-and-origin-checks.md) | Auth as 0008, plus check `Origin` whenever present and deny unlisted methods | Accepted |
| [0021](0021-frontend-state-external-store.md) | Editor state in a framework-free store, read by React via `useSyncExternalStore` | Accepted |
| [0022](0022-viewport-is-editor-state.md) | Viewport lives in editor state; pans and zooms are not document changes | Accepted |
| [0023](0023-undo-redo-document-snapshots.md) | Undo/redo with snapshots of the immutable document | Accepted |
| [0024](0024-pencil-strokes-smoothed-canvas-path.md) | Pencil strokes drawn as a smoothed Canvas path, not with rough.js | Accepted |
| [0025](0025-ship-fonts-with-fontsource.md) | Fonts as Fontsource npm packages bundled by Vite | Accepted |
| [0026](0026-shape-text-as-label-field.md) | Text inside a shape is a `label` field on the shape | Accepted |
| [0027](0027-edit-text-in-textarea-overlay.md) | Edit text in an HTML textarea over the canvas | Accepted |
| [0028](0028-ui-icons-phosphor-react.md) | UI icons from the `@phosphor-icons/react` package | Accepted |
| [0029](0029-storage-layer-in-web-src-storage.md) | Storage code in its own `web/src/storage` layer | Accepted |
| [0030](0030-drawings-http-api.md) | Drawings HTTP API: REST routes that mirror `DrawingRepository` | Accepted |
| [0031](0031-storage-mode-detection-and-server-contract-tests.md) | Pick the storage mode with a health probe; run the contract suite against a real server | Accepted |
| [0032](0032-auto-save-debounced-serialized.md) | Auto-save: debounced, one save at a time, flushed when the page hides | Accepted |
