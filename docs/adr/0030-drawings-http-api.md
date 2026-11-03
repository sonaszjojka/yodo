# 0030. Drawings HTTP API: REST routes that mirror `DrawingRepository`

- Status: Accepted
- Date: 2026-11-03

## Context
Roadmap 1.12 adds the self-hosted server's SQLite storage ([0006](0006-self-hosted-storage-go-sqlite.md), [0010](0010-sql-sqlc-modernc-sqlite-goose.md)), and 1.13 adds `HttpDrawingRepository`, which must pass the same contract suite as the IndexedDB implementation ([0005](0005-browser-storage-indexeddb.md), [0011](0011-testing-strategy.md)). The API is therefore shaped by `DrawingRepository` (`list`, `get`, `save`, `delete`). The server stores the document as opaque JSON and never parses elements ([0013](0013-drawing-document-format-and-versioning.md)).

## Decision
JSON under `/api/drawings`, one route per repository method:

| Route | Result |
|---|---|
| `GET /api/drawings` | `200`, array of summaries `{id, name, createdAt, updatedAt}` (epoch milliseconds), in no particular order |
| `GET /api/drawings/{id}` | `200`, the stored document bytes unchanged; `404` if missing |
| `PUT /api/drawings/{id}` | Upsert. `200` with the summary; `createdAt` is kept on replace. `400` for invalid JSON, a missing `name` or `schemaVersion`, or a body `id` that differs from the path; `413` above 16 MiB |
| `DELETE /api/drawings/{id}` | `204`, also when the drawing doesn't exist (idempotent, like the contract) |

- **The PUT body is the raw document.** The server decodes only the top-level `id`, `name` and `schemaVersion` into metadata columns and stores the whole body as received, so `GET` returns exactly what was saved.
- **The server sets the timestamps** from its own clock, as the IndexedDB repository does.
- **Errors** are plain-text bodies with the status code; the client only needs the status.
- **The `drawings` table holds only the columns in use:** `id`, `name`, `schema_version`, `document`, `created_at`, `updated_at`. The other columns in 0013 (`folder_id`, `deleted_at`, `search_text`) arrive with their features, each in its own migration.
- The database file is `<YODO_DATA_DIR>/yodo.db`, default `./data`; the Docker image sets `/data`.

## Alternatives considered
- **An envelope body `{name, schemaVersion, document}`**: the server never looks inside the document at all, but the client sends the name and version twice, and the two copies can disagree.
- **`POST /api/drawings` to create, then `PUT` to update**: more conventional for server-assigned ids, but the client already generates UUIDs (0013), and the repository has a single `save`. An idempotent `PUT` is also safe to retry.
- **All 0013 columns in the first migration**: no migration later, but the columns would sit unused, with no semantics or tests until their features exist.

## Consequences
- `HttpDrawingRepository` (1.13) maps each method to a single request with no translation.
- Adding folders, trash or search needs a migration and changes to the API; the routes and body stay compatible.
- The server reads three top-level fields, so a breaking change to `id`, `name` or `schemaVersion` in the document format would also need a server change.
- The 16 MiB limit bounds memory per request. Images are stored separately (0013), so normal drawings stay well below it.
