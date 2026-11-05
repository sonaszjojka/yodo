# 0040. Images are `image` elements backed by a content-addressed `ImageRepository`

- Status: Accepted
- Date: 2026-11-05

## Context
Roadmap 2.6 adds pasted images. [0013](0013-drawing-document-format-and-versioning.md) says images are stored apart from the document, referenced by content hash, in IndexedDB (hosted) and under `/data` (self-hosted). It leaves open the interface, the HTTP API, the element shape and the paste path.

Forces:
- Both modes must behave the same, proven by one contract suite ([0005](0005-browser-storage-indexeddb.md), [0011](0011-testing-strategy.md)).
- Auto-save ([0032](0032-auto-save-debounced-serialized.md)) rewrites the whole document, so image bytes must not travel with it.
- Adding an element type is not a breaking format change ([0013](0013-drawing-document-format-and-versioning.md)).
- Server requests are guarded by Host/Origin checks ([0020](0020-auth-and-origin-checks.md)) and the document limit is 16 MiB ([0030](0030-drawings-http-api.md)).

## Decision
- **A new `ImageRepository` interface** in `web/src/storage/`, next to `DrawingRepository`: `put(blob) → hash`, `get(hash) → Blob | undefined`, `has(hash)`. The hash is the lowercase hex SHA-256 of the bytes, computed by the client. It has in-memory, IndexedDB (a `blobs` object store, DB version 2) and HTTP implementations, and one shared contract suite.
- **HTTP API** under `/api/images`: `PUT /api/images/{sha256}` stores the body after re-hashing it (`400` if it differs, `413` above 10 MiB, `415` for a type other than PNG, JPEG, GIF or WebP); it is idempotent. `GET /api/images/{sha256}` returns the bytes with `Cache-Control: immutable`. Files live at `<YODO_DATA_DIR>/images/<hash>` and are written atomically (temp file, then rename). No SQLite migration.
- **A new `image` element** with `fileId` (the hash). `document.fileIds` is derived from the elements on save. No schema bump.
- **Paste:** the `paste` handler also reads `image/*` clipboard files when the clipboard has no Yodo payload. The image is stored, then placed at the view centre, scaled to fit about 40% of the view. Copying an image element copies only its `fileId` (the blob is already stored).
- **Limits:** 10 MiB and the four raster types above. SVG is not accepted (script risk when served back).
- **No garbage collection** of unreferenced blobs in this task: deleting on element removal would break undo and cross-drawing paste.

## Alternatives considered
- **Methods on `DrawingRepository`** — fewer types, but blurs one focused interface and grows its contract suite.
- **Inline base64 in the document** — no server work, but contradicts 0013 and re-uploads every image on each auto-save.
- **Storing blobs in SQLite** — one backup file, but large rows slow the database and the roadmap says "under `/data`".
- **Server-computed hash (POST returns it)** — the client could not dedupe offline or know the id before upload.

## Consequences
- Identical images are stored once, in both modes.
- Orphan blobs accumulate until a later GC task.
- The `.yodo` export (2.8) and Excalidraw import (2.9) read and write blobs through `ImageRepository`.
- The IndexedDB schema moves to version 2; existing drawings are untouched.
