# 0034. Render Home thumbnails from the documents, lazily, with the scene renderer

- Status: Accepted
- Date: 2026-11-04

## Context
Home cards show a thumbnail (`docs/product.md`, Home screen; `docs/ui.md`). `DrawingRepository.list()` returns summaries without documents ([0005](0005-browser-storage-indexeddb.md)), and the server stores documents as opaque JSON ([0013](0013-drawing-document-format-and-versioning.md)). Thumbnails follow the current theme ([0015](0015-store-light-colours-adapt-in-dark-mode.md)), so an image stored at save time would be fixed to one theme. Performance with many drawings is a first-class requirement, but M1 drawings are small.

## Decision
Each card loads its drawing with `get(id)` and draws it with the same `renderScene` the editor uses, into a small canvas. A pure core function fits the elements' bounds into the card with padding (never zoomed in past 1:1). A card starts loading only when it scrolls near the viewport (`IntersectionObserver`), and redraws when the summary's `updatedAt` changes. An empty drawing or a failed load shows a plain placeholder instead of an image; the card itself still works.

## Alternatives considered
- **Store a thumbnail image on save.** Home stays fast at any number of drawings, but it needs a new repository method, an IndexedDB store, a server column and migration, and new contract tests. Its image is also fixed to one theme.
- **Render, then cache the image in IndexedDB keyed by `id` + `updatedAt`.** Faster on repeat visits, but a second store to keep in sync, and in self-hosted mode the cache lives in each browser separately.

## Consequences
- No change to the document format, the repository or the server.
- Home loads whole documents, one per visible card. Fine at M1 sizes; with many large drawings, a stored or cached thumbnail (the alternatives above) is the follow-up, and the card component is the only place that changes.
- Dark mode (2.3) gets theme-correct thumbnails for free.
