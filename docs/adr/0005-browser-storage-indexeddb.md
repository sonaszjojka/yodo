# 0005. Store drawings in IndexedDB via `idb` in hosted mode, behind a repository interface

- Status: Accepted
- Date: 2026-10-30

## Context
The MVP is local-first with auto-save, folders, trash, search and images. Yodo runs in two modes (`docs/product.md`, "Usage modes"): hosted on GitHub Pages with no server, and self-hosted in Docker with a small server ([0006](0006-self-hosted-storage-go-sqlite.md)). In hosted mode the browser is the only place data can live.

## Decision
- In hosted mode, store drawings, folders, thumbnails and image blobs in **IndexedDB**, using the ~1 KB **`idb`** promise wrapper. Database names are prefixed `yodo-`.
- All app code accesses data through a `DrawingRepository` interface. Implementations: `IndexedDbDrawingRepository` (hosted), `HttpDrawingRepository` (self-hosted), `InMemoryDrawingRepository` (tests).
- At startup the app checks whether the Yodo API is reachable and picks the HTTP implementation if so, otherwise IndexedDB. One build serves both modes.
- Request persistent storage with `navigator.storage.persist()`.

## Alternatives considered
- **localStorage** — ~5 MB, strings only, synchronous (freezes the UI on large saves).
- **OPFS** — fast for binary files but no indexes or transactions. Possible later home for image blobs.
- **SQLite in WebAssembly** — real SQL and FTS5 search, but ~1 MB download and its fast mode needs COOP/COEP headers that GitHub Pages cannot set.
- **Dexie** — nicer queries, but larger and hides IndexedDB concepts.
- **RxDB / PouchDB** — built-in sync, but heavy and they dictate the backend's sync protocol.
- **File System Access API** — real files on disk, but Chromium only; possible later extra.

## Consequences
- Folder, trash and search queries are written by hand over IndexedDB indexes.
- IndexedDB schema changes need versioned `upgrade()` migrations.
- **Risk:** hosted-mode data is lost if browser data is cleared, and Safari may evict it after 7 days without a visit. Mitigations: `storage.persist()`, Yodo-file export, and the self-hosted mode for durable data.
