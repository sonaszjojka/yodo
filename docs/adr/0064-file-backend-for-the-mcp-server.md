# 0064. A file backend for the MCP server: one `.yodo` file per drawing with a `meta` section, Trash as a `.trash/` folder, no folders

- Status: Accepted
- Date: 2026-11-10

## Context
Roadmap 5.4: "`FileDrawingRepository` keeps `.yodo` files in `YODO_MCP_DIR` and passes `contract.ts`; folders and trash supported or scoped out in its ADR; backend picked from config (`YODO_URL` → HTTP, else files); atomic writes (temp file + rename)." ADR [0061](0061-mcp-server-as-a-typescript-package-in-mcp.md) names this backend for users without a self-hosted server. Hosted users keep their drawings in the browser's IndexedDB, which a local process can't reach, so the MCP server needs storage of its own that the user can import into the app.

A `.yodo` file ([0013](0013-drawing-document-format-and-versioning.md)) holds the document plus its images inlined in a `files` section. `DrawingRepository` also needs per-drawing metadata that a file doesn't have: `createdAt`, `updatedAt`, `revision` ([0062](0062-revision-counter-and-if-match-for-safe-concurrent-saves.md)), `deletedAt` ([0046](0046-trash-as-a-deleted-at-timestamp-on-the-summary.md)) and `folderId` ([0045](0045-folders-as-metadata-with-a-folder-repository.md)). `parseYodoFile` strips only `files` before migrating, so any other top-level key would end up in the document.

## Decision
`FileDrawingRepository` lives in `mcp/src/` (it needs `node:fs`, and 0061 keeps Node code out of `web/`). It keeps one `.yodo` file per drawing, with its metadata inside that file, so a single atomic rename writes both.

- **Layout.** `YODO_MCP_DIR` (default `~/Yodo`, created on the first write; a missing directory reads as empty) holds live drawings as `<name>.yodo`, and `.trash/<name>.yodo` holds drawings in Trash.
- **File names.** `<name>` is the id with every character outside `[a-z0-9-]` percent-encoded as UTF-8 bytes (`%2F`, `%41` for `A`, …). App ids (lowercase UUIDs) stay readable. Any id the contract allows (`a/b`, `%2E`) maps to one safe name and back, with no path separators or dot segments. Upper-case letters are encoded too, so ids that differ only in case don't collide on case-insensitive file systems (macOS, Windows). An id whose name would be longer than 200 bytes is rejected. Other files are ignored, including `.yodo` files whose decoded name isn't their document's id.
- **File content.** The file is `serializeYodoFile`'s output plus a reserved top-level `meta` section: `{ createdAt, updatedAt, revision, deletedAt? }`. `parseYodoFile` strips `meta` the same way it strips `files`. The app's file import therefore reads these files unchanged, and the app's own export doesn't write `meta`. The section exists only in files, never in a stored document, so it needs no schema version (as with `files`).
- **Files without `meta`.** An app export renamed to `<id>.yodo` and dropped into the folder is a valid live drawing. Its `createdAt` and `updatedAt` come from the file's modification time, and its revision is `1`. The first save writes a real `meta`.
- **Atomic writes.** Every write goes to a temp file in the same directory, which is then renamed over the target. A rename within one file system is atomic, so a crash leaves either the old file or the new one, never a half-written one. Leftover temp files are named `.tmp-*` and ignored.
- **Trash.** `trash` writes the file with `deletedAt` into `.trash/`, then removes the live file. `restore` does the reverse. If a crash leaves a drawing in both places, the copy in `.trash/` wins and the live copy is ignored. Both copies hold the same document, since trashing isn't an edit, and both operations are safe to retry. `emptyTrash` and `delete` remove the live copy first and the `.trash/` copy last, so an interrupted delete never brings a drawing back to life.
- **Folders are scoped out.** No `FolderRepository` exists. `move(id, null)` works, and moving into any folder rejects as a missing folder, which the `DrawingRepository` contract already allows. `folderId` is never written. No MCP tool uses folders, and adding them later needs its own ADR.
- **Images.** `save(doc)` gets no image bytes. It carries over the inlined images of the existing file for every `fileId` the document still lists. A save that lists an image with no known bytes rejects and stores nothing. Adding new images is left to the tool that needs it.
- **Revisions.** The revision check and the write are one step within the process: every operation runs through one in-process queue. Two MCP processes writing the same directory aren't serialized, so this deviates from 0062's "atomic in every implementation" across processes. Only the read-only tools exist today, and a cross-process lock is a follow-up for the write tools (5.6).
- **Search.** `searchIndex()` extracts the text from each live file when it is read (`extractSearchText`). Search still matches with `searchDrawings`, as in the other modes. A file that fails to parse is left out of `list()` and the search index, with a warning on stderr, rather than failing the whole call.
- **Config.** If `YODO_URL` is set, the server uses `HttpDrawingRepository` with `YODO_API_TOKEN`, as before. Otherwise it uses the file backend at `YODO_MCP_DIR` (default `~/Yodo`). A `YODO_API_TOKEN` set without `YODO_URL` is a startup error, because it means a misconfigured URL.

## Alternatives considered
- **One `index.json` with every drawing's metadata:** the `.yodo` files would stay exactly like exports, but each save writes two files, and a crash between the writes leaves the index out of step.
- **A sidecar `<id>.meta.json` per drawing:** the same two-write crash window, and twice as many files for the user to look through.
- **Trash as `deletedAt` only, files left in place:** simpler, but trashed drawings sit next to live ones in the folder the user imports from.
- **Trash scoped out:** it needs an opt-out in the shared `contract.ts`, and the backend would behave differently from the other two.
- **Folders as `folderId` plus a `folders.json` with a `FileFolderRepository`:** more code and tests for a feature that no tool uses.
- **Folders as subdirectories:** the easiest to browse, but folder ids, names and renames don't map cleanly onto paths.
- **An OS data directory as the default** (`~/Library/Application Support/yodo`, `$XDG_DATA_HOME`): correct for each platform, but hidden from users who want to import the files.
- **A cross-process lock file now:** stale locks after a crash need detection, and nothing writes from two processes before 5.6.

## Consequences
- Standalone agents get storage that needs no server, in plain files the user can import into either app mode.
- `core/document/file.ts` gains one stripped key (`meta`). It is a format-adjacent change, but no schema bump is needed because stored documents never contain it.
- `list()` and `searchIndex()` read and parse every file. That's fine for a personal folder; a cache can come later if large folders turn out slow.
- The DrawingRepository contract suite now also runs in `mcp/` against real temp directories.
- Follow-ups: a cross-process lock when 5.6 adds write tools, and folders only by a new ADR.
