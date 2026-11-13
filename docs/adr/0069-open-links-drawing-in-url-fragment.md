# 0069. Open links: carry a drawing in the URL fragment

- Status: Accepted
- Date: 2026-11-13

## Context
Roadmap 5.8 ([#185](https://github.com/sonaszjojka/yodo/issues/185)). With the MCP file backend ([0064](0064-file-backend-for-the-mcp-server.md)), an agent's drawing is a `.yodo` file the user has to import by hand. A link the agent hands back would open it in one click, including in the hosted app, which has no server to fetch from ([0005](0005-browser-storage-indexeddb.md), [0007](0007-distribution-pages-and-docker-go-server.md)). The browser never sends a URL fragment to a server, so a drawing in the fragment stays local. Links are a contract between versions: a link made by one MCP release must still open in later app releases.

## Decision
- **Route** `#/open/<data>` (added to the routes of [0033](0033-hash-routes-and-drawing-load-errors.md)). `<data>` is the `.yodo` export text (`serializeYodoFile`, without the MCP `meta` section), UTF-8 encoded, compressed with `deflate-raw` through the standard `CompressionStream`, then base64url without padding. The code lives in `web/src/core/document/openLink.ts`, shared by the app and the MCP server.
- **Limit:** `<data>` may be at most **16,384 characters** (`MAX_OPEN_LINK_DATA`). Above it, the MCP returns only the file path and says why, and the app refuses the link. Inflating stops after 50 MB, the file-import limit, so a small link can't expand without bound.
- **Opening** decodes and parses the data first, then asks for confirmation (name and element count). Nothing is stored before the user confirms. Confirming imports through the file-import path (`importDrawing`: `parseYodoFile`, image checks, a new id), then *replaces* the history entry with `#/d/<id>`, so Back doesn't import it again. Bad, truncated or oversized data shows an error, never a broken drawing.
- **No version prefix:** the `.yodo` inside carries `schemaVersion`, and migrations run as for a file ([0013](0013-drawing-document-format-and-versioning.md)). A different wrapper or compression would get a new route name.
- **MCP:** with the file backend, every write tool's result adds the file path and, within the limit, the link. The link uses `YODO_APP_URL` (default `https://sonaszjojka.github.io/yodo/`). It's built only from the revision this write saved; if another process saved in between ([0067](0067-cross-process-write-lock-for-the-mcp-file-backend.md)), the result says so and gives no link. With the HTTP backend the drawing is already on the user's server, so nothing changes.

## Alternatives considered
- **lz-string**, as Excalidraw-style apps use: slightly shorter links, but a dependency on both sides for what the platform does.
- **The bare document instead of the `.yodo` text:** a little smaller, but a second import path, and images would be lost.
- **Auto-import without confirmation:** one click less, but any page could add drawings to the user's storage by linking to the app.
- **Upload to a share service:** no length limit, but it needs a server, which the hosted mode doesn't have.

## Consequences
- Agents in standalone mode can hand the user a clickable link; larger drawings fall back to the file.
- The encoding is a public format now: changing it needs a new route, with `#/open/` kept working.
- Links can be long (up to 16 KB), and some chat clients may wrap them; the file path is always returned as well.
