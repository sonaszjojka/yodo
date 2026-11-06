# 0046. Trash is a `deletedAt` timestamp on the drawing summary

- Status: Accepted
- Date: 2026-11-06

## Context
Roadmap 3.2 makes delete recoverable: "Delete moves to Trash; restore, delete forever, empty with confirm" (`docs/product.md`, `docs/ui.md`). Open: how a trashed drawing is stored, how both modes expose it, what happens to a folder's drawings when the folder is deleted ([0045](0045-folders-as-metadata-with-a-folder-repository.md) made that final "until 3.2"), and whether Trash empties itself.

Forces:
- One contract suite proves both modes behave the same ([0005](0005-browser-storage-indexeddb.md), [0011](0011-testing-strategy.md)).
- The server treats the document as opaque ([0013](0013-drawing-document-format-and-versioning.md)); a trashed drawing must not need its document rewritten, and auto-save ([0032](0032-auto-save-debounced-serialized.md)) must not undo a trash.
- Local-first: no background job should be needed for the app to be correct.

## Decision
- **Trash is summary metadata.** `DrawingSummary` gets an optional `deletedAt` (epoch ms; absent means live), like `folderId` in 0045. The document, the thumbnail source and the folder membership are untouched, so a restore brings the drawing back exactly as it was.
- **`DrawingRepository` changes.** `list()` returns live drawings only, so no existing consumer has to filter. New: `listTrash()` (trashed summaries), `trash(id)` and `restore(id)` (each returns the new summary, `undefined` for a missing drawing; neither touches `updatedAt`), and `emptyTrash(options?)`, which permanently removes every trashed drawing in one atomic step, or only those with `deletedAt` before `options.deletedBefore` (the retention sweep). The check and the delete happen together, so a drawing restored (or trashed again) in another tab is never removed by a stale sweep. The existing `delete(id)` stays the permanent delete and works on any drawing. `save` keeps the stored `deletedAt`, so a drawing still open in a tab stays in Trash when it auto-saves.
- **Folders.** Deleting a folder moves its drawings to Trash and clears their folder (`folderId` absent), in one transaction; drawings already in Trash keep their `deletedAt`. A restored drawing therefore never points at a missing folder. Restoring a drawing whose folder still exists puts it back in that folder. This supersedes the "Deleting a folder deletes its drawings" bullet of 0045 (the rest of 0045 stands). The confirm dialog says the drawings move to Trash.
- **Retention: 30 days.** A drawing trashed more than 30 days ago is deleted forever. The sweep is client-side and the same in both modes: when Home loads it calls `emptyTrash({ deletedBefore: now - 30 days })`. No server timer, so the server stays a plain store and the rule is testable with a fake clock. The Trash screen states the rule.
- **Server:** migration `00003` adds `drawings.deleted_at INTEGER` (nullable; existing rows are live) and an index. `UpsertDrawing` does not touch it. Routes: `GET /api/drawings?trashed=true` lists the trash (without it, only live drawings); `PUT /api/drawings/{id}/trash` with body `{"trashed": true|false}` trashes or restores and returns the summary (`404` for a missing id, `400` for a malformed body); `DELETE /api/drawings?trashed=true[&deletedBefore=<ms>]` empties the trash, optionally only older items (`204`; `400` for a non-numeric `deletedBefore`; without the parameter the method is `405`, so a bare `DELETE` can never wipe everything). `DELETE /api/folders/{id}` trashes the folder's drawings, clears `folder_id` and deletes the folder in one transaction; `ON DELETE CASCADE` stays as a backstop and is then a no-op.
- **IndexedDB:** no schema change and no version bump: summaries are plain records, and existing ones simply lack `deletedAt`, which means live. `list()` filters on it. A folder delete updates its drawings' summaries and removes the folder in one transaction.
- **Images** are content-addressed and shared ([0040](0040-images-in-a-content-addressed-image-repository.md)), so a permanent delete leaves them, as before.

## Alternatives considered
- **A separate trash table / object store** — keeps the main list query untouched, but copies whole documents back and forth and doubles the code in IndexedDB, SQLite and the contract suite.
- **`list()` returns everything and the UI filters** — one method fewer, but every consumer (Home, folder counts, search) must remember to filter; one miss shows deleted drawings.
- **Trash ids in `localStorage`** — not shared between browsers in self-hosted mode, so it fails the "works in both modes" criterion.
- **No auto-purge** — simpler, but Trash then grows forever; the owner chose 30 days.
- **A server-side purge job** — would purge even if nobody opens the app, but adds a timer, a clock in tests and a second place for the rule; the client sweep is enough for a single-user app.
- **Keep folder delete permanent** — no change to folders, but it would be the one delete that bypasses Trash.

## Consequences
- A trash or restore never rewrites the document, so it cannot race with auto-save.
- Every `DrawingRepository` implementation gains four methods, and `list()` callers need no change.
- A folder delete is now recoverable; a drawing restored from it lands outside any folder.
- Expiry only runs when someone opens Home; an unattended server keeps expired items until the next visit.
- Opening a trashed drawing by URL still works and edits stay in Trash; the Trash screen offers only Restore and delete forever.
- `docs/ui.md`, `docs/roadmap.md`, `CLAUDE.md` and the 0045 text on folder deletion go stale and are updated with this task.
