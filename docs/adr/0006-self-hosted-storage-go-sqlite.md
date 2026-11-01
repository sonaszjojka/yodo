# 0006. Store self-hosted data on disk with a Go server and SQLite

- Status: Accepted
- Date: 2026-10-30
- Amended: 2026-10-30 — linked the follow-up ADRs 0009 and 0010

## Context
Users who run Yodo themselves must not lose drawings by clearing browser data, and must see the same drawings in every browser. A browser cannot write freely to disk, so a process next to it has to persist the data. The owner wants to learn Go.

## Decision
- The self-hosted version includes a small **Go** server, already in the MVP. It serves the frontend and a JSON API used by `HttpDrawingRepository` ([0005](0005-browser-storage-indexeddb.md)).
- Data is stored in **SQLite**, one database file plus an image directory under `/data`, mounted as a Docker volume.
- The HTTP framework ([0009](0009-go-http-standard-library.md)) and SQL access and migrations ([0010](0010-sql-sqlc-modernc-sqlite-goose.md)) are decided in separate ADRs.

## Alternatives considered
- **nginx serving static files only** (original [0003](0003-distribution-github-pages-and-docker.md)) — data would still live in the browser, failing the requirement.
- **PostgreSQL** — the standard for multi-user servers, but a second container and more ops for a single-user install. Revisit when a shared multi-user server is built.
- **File System Access API** — no server needed, but Chromium only.
- **Desktop wrapper (Tauri/Electron)** — not usable from different browsers; listed as later in `docs/product.md`.

## Consequences
- Go backend work moves into the MVP, so M1 is larger.
- Backup and migration mean copying the `/data` volume.
- SQLite limits concurrent writers; fine for one user, a reason to add PostgreSQL for multi-user later.
- The API design must stay compatible with a future multi-user server.
