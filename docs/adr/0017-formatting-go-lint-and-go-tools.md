# 0017. Format with Prettier and gofmt, lint Go with golangci-lint, pin Go tools with `go tool`

- Status: Accepted
- Date: 2026-11-01

## Context
Roadmap 0.2 needs format checks for TypeScript and Go and a Go linter, so that "lint and format checks are clean" in the definition of done (`docs/conventions.md`) can be checked locally and in CI (0.3). TypeScript linting is already oxlint ([0016](0016-typescript-lint-oxlint.md)), and the formatter must not overlap with it. sqlc ([0010](0010-sql-sqlc-modernc-sqlite-goose.md)) is a build step, so its version must be the same on every machine and in CI.

## Decision
- **TypeScript (`web/`): Prettier**, run with `npm run format` (write) and `npm run format:check` (CI). It formats only; oxlint stays the only linter.
- **Go (`server/`): golangci-lint v2**, config in `server/.golangci.yml`. It runs the linters (default set: `govet`, `staticcheck`, `errcheck`, `ineffassign`, `unused`) and the `gofmt` and `goimports` formatters, so `golangci-lint run` and `golangci-lint fmt` cover both Go lint and format.
- **Go dev tools are pinned with the `tool` directive** (Go 1.24+) in `server/go.mod` and run as `go tool <name>`; sqlc is the first one. golangci-lint is the exception: its maintainers advise against installing it via `go tool`/`go install`, so it is a pinned binary (Homebrew locally, the official GitHub Action in CI).

## Alternatives considered
- **oxfmt** (TS) — same family as oxlint and much faster, but younger, with less stable output and fewer editor integrations.
- **Biome format-only** (TS) — fast and mature, but its built-in linter would have to be switched off to avoid overlapping with oxlint.
- **go vet + staticcheck** (Go) — minimal, but fewer checks (no errcheck) and three commands instead of one.
- **Separate tools module** (`server/tools/go.mod`) — keeps the app's `go.mod` free of tool dependencies, at the cost of `-modfile` on every command.
- **Homebrew / binary for every tool** — simplest, but local versions drift from CI.

## Consequences
- One command per check and part (`npm run lint`, `npm run format:check`, `golangci-lint run`, `golangci-lint fmt --diff`); CI in 0.3 calls the same commands.
- `go tool sqlc` works on any machine with Go; no extra install step.
- sqlc adds many indirect dependencies to `server/go.mod`. sqlc's own code is not compiled into the server binary, but its dependencies are part of the server's module graph: minimum version selection uses their versions as floors, so a module the server shares with sqlc (e.g. `golang.org/x/sys`, `x/text`) gets at least the version sqlc requires. Bumping sqlc can therefore change library versions in the server binary, and vulnerability scanners will report sqlc's dependencies against the server module. We accept this for now; if it starts to cause real conflicts (watch from 1.12, when the SQLite driver is added), move the tools to a separate module.
- golangci-lint must be installed separately, and its local version can drift from CI; the version is pinned in CI and noted in the project CLAUDE.md.
