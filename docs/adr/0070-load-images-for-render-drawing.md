# 0070. Load real images in render_drawing, within resource limits

- Status: Accepted
- Date: 2026-11-13

## Context
Issue [#199](https://github.com/sonaszjojka/yodo/issues/199), the follow-up [0065](0065-render-drawings-in-node-with-napi-rs-canvas.md) names: `render_drawing` drew every image element as the export's grey placeholder, because neither MCP backend gave the renderer image bytes. The bytes exist: the self-hosted server serves them at `GET /api/images/{hash}` ([0040](0040-images-in-a-content-addressed-image-repository.md)), reachable with the API token ([0063](0063-api-token-for-non-browser-clients.md)), and a `.yodo` file inlines them in its `files` section ([0064](0064-file-backend-for-the-mcp-server.md)).

Core looks images up synchronously while it draws (`Surface['images']`, `SvgDeps.imageData`), so they must be loaded first. Images may be up to 10 MB each (0040) and any size in pixels, while one tool call runs inside the agent's MCP process: without limits, a render could decode gigabytes of pixels or return an SVG of hundreds of megabytes.

## Decision
- **An injected image source.** `createServer` takes an optional `ImageSource` (`mcp/src/render/images.ts`) that reads the bytes of given fileIds for a drawing, and never throws for a single image. `index.ts` passes one per backend:
  - **HTTP:** `HttpImageRepository` over the same bearer `fetch`, at most 4 requests at a time;
  - **files:** `FileDrawingRepository.imageFiles`, one read of the drawing's `files`.
  Without a source, images stay placeholders.
- **Load, then draw.** Only the image elements being rendered are loaded, each `fileId` once. Each is checked (a raster type from `IMAGE_TYPES`, at most `MAX_IMAGE_BYTES`), sized from its header without decoding, then decoded with `@napi-rs/canvas`'s `loadImage`. PNG draws the decoded image; SVG embeds the bytes as a `data:` URI.
- **Limits.** An image past a limit becomes a placeholder:
  - decoded pixels: at most **25 megapixels** per image, and **50 megapixels** for the whole render;
  - SVG only: at most **8 MB** of embedded image bytes, counted once per element that shows them (an image used three times counts three times). Every use of an image that doesn't fit becomes a placeholder.
- **Say which.** The result text lists each placeholder's element id and reason:
  - missing;
  - undecodable;
  - unsupported type;
  - too large;
  - too large to decode;
  - over the SVG size limit;
  - read failed.
- **File backend scope.** A `.yodo` file whose `files` lack an image's entry, or hold malformed base64, stays a broken file that every tool skips (`parseYodoFile`, 0064). Reads aren't made tolerant for rendering alone. With files, only an undecodable image (well-formed base64 of bad bytes) falls back to a placeholder.

## Alternatives considered
- **No limits.** Simplest, but one drawing of large photos could exhaust the agent's process or return a 100+ MB result.
- **Linking images in the SVG instead of embedding them.** Small output, but the agent's client can't fetch our URLs with the token, and the file backend has no URLs.
- **Tolerant `.yodo` reads in the file backend**, so a file missing an image's bytes still renders. It would change how every tool reads files, and a write could then re-save a file the app refuses to import.
- **Widening `getWithRevision` to return images.** It would change the shared `DrawingRepository` contract and every implementation for one MCP tool.

## Consequences
- Agents see the real pictures in both formats and backends, and are told exactly which images aren't shown and why.
- A render now does network or file reads for images; a slow image server slows `render_drawing` but can't fail it.
- The limits are constants in `images.ts`. Raising them is a code change; the ADR says why they exist.
- An image within 0040's limits can still be a placeholder in SVG (over 8 MB) or in both formats (over the pixel limits). The text says so.
