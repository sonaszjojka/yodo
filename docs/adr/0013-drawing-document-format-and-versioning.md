# 0013. One versioned drawing document format, migrated in the core

- Status: Accepted
- Date: 2026-10-30
- Amended: 2026-11-01 — ID generation falls back to `crypto.getRandomValues()` in non-secure contexts

## Context
The same drawing data lives in three places: IndexedDB ([0005](0005-browser-storage-indexeddb.md)), the self-hosted SQLite database ([0006](0006-self-hosted-storage-go-sqlite.md)), and exported Yodo files. The format will change as features are added, and old drawings and files must keep opening. Changing this after the first drawings are saved is expensive.

## Decision
- A drawing is a single JSON-serialisable **document** defined in `web/src/core`:
  `{ type: "yodo", schemaVersion, id, name, elements: [...], appState: {...}, fileIds: [...] }`.
- `schemaVersion` is an integer, bumped on every breaking change. The core holds pure migration functions (`v1 → v2`, `v2 → v3`, …) applied on load from **any** source; they are unit-tested with fixture documents of every old version.
- IDs are random UUID v4 from the built-in Web Crypto API: `crypto.randomUUID()`, falling back to `crypto.getRandomValues()` where it is unavailable (non-secure contexts, such as plain HTTP on a LAN address).
- **The server treats the document as opaque JSON.** SQLite stores it in a `TEXT` column next to queryable metadata (`id`, `name`, `folder_id`, `updated_at`, `deleted_at`, `search_text`, `schema_version`). The client computes `search_text` (names + text on canvas) on save. Element logic exists only once, in TypeScript.
- Images are stored separately (IndexedDB blobs / files under `/data`) and referenced by content hash, so identical images are stored once.
- **Export file** (`.yodo`): the document plus the referenced images inlined as base64, as one JSON file. Import runs the same migrations.

## Alternatives considered
- **Normalised SQL tables for elements** — queryable on the server, but duplicates the element model in Go and SQL and makes every schema change a two-language migration.
- **No version field, tolerant parsing** — simple at first, but silently breaks old files.
- **Zip-based export with separate image files** — smaller files, but needs a zip library and is not human-readable; possible later as a second format.

## Consequences
- Old drawings and exported files keep opening after upgrades.
- The server cannot query inside drawings, only the metadata the client provides; acceptable for a single-user server.
- Every format change needs a migration and a fixture test.
- Base64 makes exports ~33% larger than the raw images.
