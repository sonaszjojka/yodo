# 0029. Storage code in its own `web/src/storage` layer

- Status: Accepted
- Date: 2026-11-03

## Context

Roadmap 1.11 adds the `DrawingRepository` interface and its in-memory and IndexedDB implementations ([0005](0005-browser-storage-indexeddb.md)); 1.13 adds the HTTP one. Until now `web/src/` had two layers ([0002](0002-frontend-react-typescript-vite.md)): `core/` (pure logic, no React) and `ui/` (the React shell). Repository code doesn't fit either: it isn't React, but it does browser I/O (IndexedDB, later `fetch`), which the core has avoided so far, so core tests never need fakes for the outside world.

## Decision

Put storage code in a third layer, **`web/src/storage/`**. It holds the repository interface, every implementation and the shared contract suite ([0011](0011-testing-strategy.md)).

- Allowed imports: `storage/` may import `core/` (document types, `migrate`); `core/` never imports `storage/`; `ui/` uses storage only through the `DrawingRepository` interface.
- `storage/` never imports React or `ui/`.

## Alternatives considered

- **`web/src/core/storage/`** — no new layer, but `core/` would stop being pure logic and start doing I/O.
- **`web/src/ui/storage/`** — close to where it is used, but ties storage to the React shell, and the contract suite would sit in the UI layer.

## Consequences

- `core/` stays pure and fast to test; I/O is isolated in one place.
- One more top-level folder to explain in CLAUDE.md.
- The import rules are a convention, not enforced by a lint rule yet.
