# 0062. Safe concurrent saves: a revision counter per drawing, `If-Match` and conflicted copies

- Status: Accepted
- Date: 2026-11-10

## Context
Roadmap 5.1: "`PUT /api/drawings/{id}` honours `If-Match` (revision chosen in an ADR) … `DrawingRepository.save` takes an optional expected revision in all implementations, covered by the contract suite; on a conflict or on focus with a newer version, the editor loads it and shows a notice, never losing work silently."

Today every save is last-writer-wins. Two tabs on one drawing (in either mode), or the MCP server's write tools (5.6, [0061](0061-mcp-server-as-a-typescript-package-in-mcp.md)) next to an open editor, silently overwrite each other. Auto-save ([0032](0032-auto-save-debounced-serialized.md)) makes this likely: a tab left open re-saves its stale copy on its next edit.

Forces:
- One contract suite proves both modes behave the same ([0005](0005-browser-storage-indexeddb.md), [0011](0011-testing-strategy.md)).
- The server treats the document as opaque ([0013](0013-drawing-document-format-and-versioning.md)), so the revision must live outside it.
- `updatedAt` comes from a clock in milliseconds, so two saves in the same millisecond look the same.
- Old clients (a tab open across an upgrade), file import and the Excalidraw import save without knowing any revision.

## Decision
- **The revision is an integer counter on the summary.** `DrawingSummary.revision` (≥ 1) is set to 1 on a drawing's first save and increases by 1 on every save. `move`, `trash` and `restore` are not edits, so they don't change it, like `updatedAt` ([0045](0045-folders-as-metadata-with-a-folder-repository.md), [0046](0046-trash-as-a-deleted-at-timestamp-on-the-summary.md)). It is metadata, not part of the document, so `schemaVersion` doesn't change.
- **Repository API.**
  - `save(doc, { expectedRevision? })`: with `expectedRevision`, the save happens only if the stored drawing exists and has that revision. Otherwise it rejects with `RevisionConflictError` (carrying `currentRevision`, undefined for a missing drawing) and stores nothing. Without it, the save is unconditional, as before. The check and the write are atomic: one IndexedDB `readwrite` transaction, and one SQL statement on the server.
  - `getWithRevision(id)` returns `{ doc, revision }` from one read, so the editor never pairs a document with another version's revision.
  - `getRevision(id)` returns only the revision (undefined for a missing drawing), for the cheap check on focus.
- **HTTP** (extends [0030](0030-drawings-http-api.md)):
  - `GET /api/drawings/{id}` adds `ETag: "<revision>"`.
  - `HEAD /api/drawings/{id}` returns that `ETag` without reading the document.
  - `PUT` accepts `If-Match: "<revision>"` and answers **`412 Precondition Failed`** on a mismatch or a missing drawing, with the current `ETag` when there is one. A malformed `If-Match` gets `400`. Without the header, the `PUT` stays unconditional. Every `200` carries the new `ETag` and `revision` in the summary.
  - This follows RFC 9110 §13.1.1. The roadmap's "409" was a guess; `409 Conflict` is meant for a state conflict without a precondition.
- **Editor.** The editor keeps the revision it last loaded or saved, and auto-save always sends it.
  - **Conflict on save:** the local version is saved as a new drawing, "‹name› (conflicted copy)", in the same folder. The editor then loads the stored version and shows a `Notice` with "Open copy". Nothing is lost, and nothing waits for a dialog.
  - **Focus:** when the tab regains focus, any pending change is flushed first (so the conflict rule above applies). Then the revision is compared with `getRevision`; if the stored one is newer, the editor loads it, shows a `Notice`, and clears undo/redo, because undo across another writer's changes would overwrite them on the next save.

## Alternatives considered
- **`updatedAt` as the revision**: needs no migration, but two saves in the same millisecond collide, and it depends on the clock. That leaves a real lost-update hole.
- **A content hash as the ETag**: identical content gives an identical tag, but every save pays for a hash, and `list()` still needs a stored column. It's more machinery for the same guarantee.
- **`409 Conflict`** (as the roadmap first said): it works, but it differs from what HTTP clients and proxies expect from a failed `If-Match`.
- **Discarding local edits with a notice**: simpler, but it drops work, just not silently.
- **A Keep mine / Load theirs / Copy dialog**: the most control, but more UI and tests, and a modal could interrupt a stroke.
- **Requiring `If-Match` on every `PUT`**: stricter, but it breaks old tabs and the import paths for no gain in a single-user app.

## Consequences
- Lost updates between tabs, devices and the MCP server (5.6) become visible conflicts; agents get a "re-read and retry" signal from the 412.
- Server: goose migration `00005` adds `drawings.revision INTEGER NOT NULL DEFAULT 1`, and `UpsertDrawing` increments it. IndexedDB: summaries without `revision` read as 1, so there's no version bump.
- Every `DrawingRepository` implementation (IndexedDB, HTTP, memory) gains the option and two methods; the contract suite covers them.
- A conflict can leave stray "(conflicted copy)" drawings for the user to tidy up.
- A first save without a revision is still unconditional. Ids are client UUIDs ([0013](0013-drawing-document-format-and-versioning.md)), so two clients never create the same id.
- `docs/roadmap.md` (409 → 412) and `CLAUDE.md` (architecture) go stale and are updated with this task.
