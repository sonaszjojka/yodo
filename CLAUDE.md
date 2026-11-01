# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Yodo is a local-first, Excalidraw-like drawing app. It's a monorepo (ADR 0012): `web/` (React + Vite + TS), `server/` (Go), `e2e/` (Playwright, added later), `docs/`. The project is early: `docs/roadmap.md` lists what exists and what's next, and `docs/plan.md` has the current status.

## Commands
Node 24 (`web/.nvmrc`, `nvm use`), Go 1.27. golangci-lint 2.15 is a separate binary (`brew install golangci-lint`), and sqlc is pinned in `server/go.mod` and runs via `go tool` (ADR 0017).

**web/** (run from `web/`)
| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Tests | `npm test` (Vitest, single run) · one file: `npx vitest run src/path/file.test.ts` · one test: `npx vitest run -t "name"` |
| Lint | `npm run lint` (oxlint, ADR 0016) |
| Format | `npm run format` · check: `npm run format:check` (Prettier, no semicolons, single quotes) |
| Type-check + build | `npm run build` (`tsc -b && vite build`) |

**server/** (run from `server/`)
| Task | Command |
|---|---|
| Tests | `go test ./...` · one test: `go test ./cmd/yodo -run TestName` |
| Lint | `golangci-lint run` |
| Format | `golangci-lint fmt` · check: `golangci-lint fmt --diff` (gofmt + goimports) |
| Generate SQL code | `go tool sqlc generate` (commit the output in `internal/db/`) |

Before calling a task done, run the test, lint, format-check and type-check commands for every part that changed (definition of done, `docs/conventions.md`).

## Architecture (see `docs/adr/README.md` for the full index)
- **Two usage modes, one frontend.** *Hosted* is a static build on GitHub Pages that stores drawings in IndexedDB (ADR 0005). *Self-hosted* is a Docker image where the Go server serves the same build and stores drawings in SQLite (ADR 0006, 0007). The build uses `base: './'` so it works under `/yodo/` and `/`.
- **Framework-free core.** `web/src/core/` (document model, geometry, hit-testing, undo/redo) must not import React; `web/src/ui/` is the React shell (ADR 0002). Rendering is Canvas 2D + rough.js, with a fixed seed per element (ADR 0004).
- **Storage behind one interface.** All data access goes through `DrawingRepository`, which has an IndexedDB implementation and an HTTP implementation. One shared contract test suite runs against both (ADR 0005, 0011).
- **Document format.** Drawings are a versioned JSON document (`schemaVersion` plus migrations). The server stores it as opaque JSON and never parses elements (ADR 0013). A format change needs a version bump and a migration.
- **Server.** Stdlib `net/http` (ADR 0009); SQLite via the pure-Go modernc driver, sqlc-generated queries from `queries/`, and goose migrations in `migrations/` embedded and applied at startup (ADR 0010). Auth: none in hosted mode; localhost-only plus optional `YODO_PASSWORD` when self-hosted (ADR 0008).
- **Colours** are stored as light-theme values and adapted when rendering in dark mode (ADR 0015).
- **Tests** follow the pyramid in ADR 0011: Vitest for core and UI, `httptest` against a real temp SQLite file for Go, and a few Playwright e2e and visual tests.

## Rules
- **Every architectural decision gets an ADR** in `docs/adr/` (template `0000-template.md`, then add a row to the index). Never rewrite an accepted ADR: write a new one and mark the old one `Superseded by NNNN`. Use `/adr`.
- Roadmap tasks flagged `needs-adr` need their ADR before implementation.
- Follow `docs/conventions.md`: Conventional Commits (scopes `web`, `server`, `e2e`, `docs`, `ci`, `deps`), **no AI attribution trailers**, one branch per task (`feat/<id>-<slug>`), and PRs squash-merged into protected `main`. The owner approves commits, pushes, PRs and merges.
- UI work follows `docs/ui.md`; product scope and done-when criteria are in `docs/product.md` and `docs/roadmap.md`.
- Workflow skills in `.claude/skills/`: `/feature`, `/fix`, `/commit`, `/ship`, `/adr`.
