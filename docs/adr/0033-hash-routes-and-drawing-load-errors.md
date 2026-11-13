# 0033. Hash routes with a small own hook; a drawing that fails to load shows an error, not a blank drawing

- Status: Accepted
- Date: 2026-11-04
- Amended: 2026-11-13 — the routes so far: `#/` (Home), `#/d/<id>` (editor), `#/f/<id>` (folder, 0045), `#/trash` (0046), `#/open/<data>` (open link, [0069](0069-open-links-drawing-in-url-fragment.md))

## Context
Roadmap 1.15 adds the Home screen and the routes `#/` (Home) and `#/d/:id` (editor). Hash routing itself was settled in [0007](0007-distribution-pages-and-docker-go-server.md): GitHub Pages has no SPA fallback, and the build must work under `/yodo/` and `/`. Still open: how the app reads the route, and what startup does now that Home exists.

Until now startup opened the drawing saved most recently, and on any load error it opened a new, blank drawing showing "Saved" ([0032](0032-auto-save-debounced-serialized.md), issue #67). One stroke in that blank drawing made it the newest one, so the real drawing stopped opening at startup, and the user never saw why.

## Decision
- **Routing:** a small hook in `web/src/ui/` reads `location.hash`, listens for `hashchange`, and parses it into `{ name: 'home' } | { name: 'drawing', id }`. Navigation sets `location.hash`, so Back and Forward work. An unknown hash shows Home. No router library.
- **Startup** opens whatever the URL says. An empty hash or `#/` opens Home, so a reload of the editor stays on the same drawing.
- **Opening a drawing:** the editor mounts only after `get(id)` resolves with a document. If `get` resolves `undefined`, the page says "Drawing not found", with Back to Home. If it rejects (server down, newer `schemaVersion`), the page shows the error with Try again and Back to Home. The app never makes a blank drawing on its own, and nothing is auto-saved for a drawing that didn't load.
- **New drawing:** "+ New drawing" saves an empty document first, then navigates to it, so a reload right away still finds it.

## Alternatives considered
- **wouter** (~2 KB, hash location supported). A familiar API, but a dependency for two routes.
- **react-router `HashRouter`.** The standard, but large, and most of its features (loaders, nested layouts) aren't needed.
- **Keep the fallback drawing, plus an error banner, and don't save it until it's edited.** Less UI to build, but the user still lands in a drawing they didn't ask for.

## Consequences
- The route type is the single list of screens; new screens (Trash, search) add a variant there.
- A route needing more than one path parameter, or data loaded before render, would mean outgrowing the hook; revisit then.
- `openLastDrawing` in `storage/startup.ts` goes away.
- Creating a drawing costs one save before the editor opens.
