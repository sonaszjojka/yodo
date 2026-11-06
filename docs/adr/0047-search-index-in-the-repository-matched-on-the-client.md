# 0047. Search: an index in the repository, matched on the client

- Status: Accepted
- Date: 2026-11-06

## Context
Roadmap 3.3: "Finds drawings by name and canvas text (`search_text`, ADR 0013); results split as in `docs/ui.md`". ADR 0013 already says the client computes `search_text` on save and the server only stores it. Open: how that text reaches the server (the `PUT` body is the raw document, [0030](0030-drawings-http-api.md)), how Home reads it back, and who does the matching so both modes give the same results ([0005](0005-browser-storage-indexeddb.md), [0011](0011-testing-strategy.md)).

## Decision
- **`search_text` is the text on the canvas only:** free `text` elements and the `label.text` of shapes and notes, joined by `\n`. The drawing name is matched from `DrawingSummary.name`, which the "In names" section needs anyway. This refines 0013's "names + text". It is derived data, so there is no `schemaVersion` bump.
- **The index lives in the repository.** `DrawingRepository.searchIndex()` returns `{ id, searchText }[]` for live drawings (trashed ones are left out, like `list()`), without loading documents. `save()` computes the text with one pure core function (`extractSearchText`), which also replaces lone UTF-16 surrogates so encoding can't throw. A failing index step never blocks a save.
- **Matching is on the client,** in one pure core function (`searchDrawings`): case-insensitive literal substring, so both modes return the same results and snippets.
- **IndexedDB:** DB_VERSION 4 adds a `search` object store `{ id, text }`, written in the same transaction as the drawing. The upgrade backfills it from the stored documents.
- **Server:** migration `00004` adds a nullable `drawings.search_text` (NULL = not indexed). `PUT /api/drawings/{id}` reads the text from the header `X-Yodo-Search-Text` (percent-encoded); the body stays the raw document. A missing header sets NULL, so a client that doesn't send it can't leave a stale index. `GET /api/search-index` lists `{ id, searchText }` (`null` for not indexed) outside `/api/drawings/{id}`, so no id is shadowed.
- **`PUT /api/drawings/{id}/search-text`** (body: the text, at most 1 MiB; `404` for a missing drawing) sets only `search_text` and leaves `updated_at` alone. It covers what a header can't: **backfill** (the HTTP repository fetches the documents of `null` entries in `searchIndex()` and sends their text) and **oversize text** (when the encoded text is over about 6 KB, `save()` sends the header without it and then calls this endpoint, so nothing is dropped).

## Alternatives considered
- **Server-side matching (SQL `LIKE` / FTS5)** — scales further, but needs a second matching and snippet implementation that can disagree with the IndexedDB one, and a new query API. Revisit when libraries grow large.
- **Load every document on the client** — no schema change, but reads every document for each search and ignores the 0013 column.
- **`searchText` as a top-level document field** — one request, but derived data would end up in `.yodo` exports and could disagree with the elements.
- **A separate request on every save** — avoids header limits, but two non-atomic requests per auto-save.
- **Cap the text and drop the rest** — simplest, but makes long canvas text unsearchable.

## Consequences
- Search is identical in both modes and the matching is unit-testable without a server.
- Every search loads all search texts into the browser; fine for a single-user app, and the first thing to revisit at scale.
- Saving oversize text takes two requests; the second can fail, leaving that drawing's index stale until the next save or backfill.
- The server stays unaware of elements; the client owns what counts as text.
