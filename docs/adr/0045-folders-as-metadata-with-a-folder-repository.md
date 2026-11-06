# 0045. Folders are metadata outside the document, behind a `FolderRepository`

- Status: Accepted
- Date: 2026-11-06

## Context
Roadmap 3.1 adds folders: create, rename and delete them with an icon and colour, move drawings into them, list them in a sidebar, in both modes. [0013](0013-drawing-document-format-and-versioning.md) lists `folder_id` among the queryable metadata columns and [0030](0030-drawings-http-api.md) postponed it to "its own migration". Open: where membership lives, how folders are stored and served, what deleting a folder does, and how the Home route selects a folder.

Forces:
- Auto-save ([0032](0032-auto-save-debounced-serialized.md)) rewrites the whole document. A move or rename must not be overwritten by it, and it must not undo a move.
- Both modes must behave the same, proven by one contract suite ([0005](0005-browser-storage-indexeddb.md), [0011](0011-testing-strategy.md)).
- The server treats the document as opaque ([0013](0013-drawing-document-format-and-versioning.md)).
- Trash does not exist yet (3.2), so a delete is final.

## Decision
- **Membership is summary metadata, not a document field.** `DrawingSummary` gets an optional `folderId` (absent means no folder). `DrawingRepository.save` keeps the stored `folderId`; the new `move(id, folderId | null)` changes only it, does not touch `updatedAt` (moving is not editing), and returns the new summary (`undefined` for a missing drawing). A folder id that does not exist is an error. No format bump.
- **A new `FolderRepository`** in `web/src/storage/`, next to the other two: `list()`, `save(folder)` (upsert, keeps `createdAt`) and `delete(id)`. A `Folder` is `{id, name, icon, color, createdAt}`; ids are client UUIDs. `icon` and `color` are keys into fixed sets in the UI (a Phosphor icon, one of the 8 drawing-palette colour names from `docs/ui.md`), so dark mode can adapt the colour and the server stays ignorant of the sets. In-memory, IndexedDB and HTTP implementations share one contract suite.
- **Deleting a folder deletes its drawings** (the owner's choice). The UI confirms and states how many drawings go. Images are content-addressed and shared, so they stay ([0040](0040-images-in-a-content-addressed-image-repository.md)).
- **Server:** migration `00002` creates `folders` (`id`, `name`, `icon`, `color`, `created_at`) and adds `drawings.folder_id REFERENCES folders(id) ON DELETE CASCADE` (`foreign_keys` is already on, [0010](0010-sql-sqlc-modernc-sqlite-goose.md)). Routes: `GET /api/folders`, `PUT /api/folders/{id}` (upsert; `400` for a body id that differs or an empty name/icon/color), `DELETE /api/folders/{id}` (`204`, idempotent) and `PUT /api/drawings/{id}/folder` with `{"folderId": string | null}` (`404` for a missing drawing, `400` for a missing folder). `GET /api/drawings` summaries gain `folderId` when set. `UpsertDrawing` does not write `folder_id`, so `PUT /api/drawings/{id}` keeps it.
- **IndexedDB:** database version 3 adds a `folders` store. Existing summaries simply lack `folderId`. Deleting a folder removes the folder and its drawings and documents in one transaction.
- **Route:** `#/` stays All drawings; `#/f/<id>` is Home filtered to one folder ([0033](0033-hash-routes-and-drawing-load-errors.md)), so reload and Back keep the selection. A drawing created while a folder is selected is placed in it.

## Alternatives considered
- **`folderId` as a document field** — folders would travel in `.yodo` files, but the server would read one more field, a move would rewrite the document and race with auto-save, and an imported file would point at folders that may not exist.
- **A link table (`drawing_folders`)** — would allow several folders per drawing later, but `docs/product.md` says one folder, and it adds a join and a second store for no current need.
- **Move the drawings out on folder delete** — no data loss, but not what the owner chose; a later Trash can make deleting recoverable.
- **`PATCH /api/drawings/{id}`** — the conventional verb for a partial update, but a sub-resource `PUT` keeps the idempotent, whole-value style of 0030 and adds no new method.

## Consequences
- Rename, icon and colour changes are a plain `FolderRepository.save`; moves never touch the document or its thumbnail.
- A folder delete is final until 3.2; the confirm dialog is the only guard.
- Every `DrawingRepository` implementation gains `move`, and every summary consumer sees an optional `folderId`.
- A server created before this migration upgrades in place: existing drawings have `folder_id` NULL.
- Saves stay upserts ([0032](0032-auto-save-debounced-serialized.md), last write wins). A drawing still open in another tab when its folder is deleted is re-created by that tab's next auto-save, without a folder. This is pinned by a test rather than prevented.
