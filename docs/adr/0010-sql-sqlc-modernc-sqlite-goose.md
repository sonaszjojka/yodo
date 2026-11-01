# 0010. Access SQLite with sqlc, the pure-Go modernc driver, and embedded goose migrations

- Status: Accepted
- Date: 2026-10-30

## Context
The self-hosted server stores data in SQLite ([0006](0006-self-hosted-storage-go-sqlite.md)). Self-hosters run a single `docker run` command, so the binary must create and upgrade its own schema. The owner wants readable SQL and compile-time safety while learning Go.

## Decision
- **sqlc** generates typed Go code from hand-written SQL queries.
- **`modernc.org/sqlite`** is the driver: pure Go, no CGO, so the server builds as one static binary.
- **goose** manages versioned `.sql` migrations, embedded in the binary with `embed` and applied automatically at startup. sqlc reads the same migration files as its schema.
- Connections enable `journal_mode=WAL`, `busy_timeout`, and `foreign_keys=ON`.

## Alternatives considered
- **Raw `database/sql` / sqlx** — no code generation, but repetitive scanning and query errors appear only at runtime.
- **GORM** — less SQL to write, but hides queries and behaves surprisingly; widely criticised in the Go community.
- **`mattn/go-sqlite3`** — faster, but needs CGO, complicating Docker builds and cross-compilation.
- **golang-migrate** — popular, but clunkier embedding; **Atlas** — declarative, more tooling than needed.

## Consequences
- `sqlc generate` is a build step; generated code is committed and checked in CI.
- Migrations are forward-only in practice; every schema change is a new numbered file.
- Startup fails fast if a migration fails, so a broken upgrade never runs on a half-migrated database.
- Moving to PostgreSQL later is supported by both sqlc and goose, though SQL dialect differences need porting.
