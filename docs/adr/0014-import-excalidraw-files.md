# 0014. Import Excalidraw files by converting them to the Yodo document

- Status: Accepted
- Date: 2026-10-30

## Context
Yodo's users are likely to have existing drawings made in Excalidraw (see "Goal" in [`docs/product.md`](../product.md)). They should be able to bring them into Yodo without redrawing.

Yodo keeps its own versioned document format and `.yodo` export file ([0013](0013-drawing-document-format-and-versioning.md)). That stays: Yodo has features Excalidraw lacks (sticky notes, folders, its own styles) and must control its own migrations.

Excalidraw files (`.excalidraw`) are JSON (`type: "excalidraw"`, `version`, `elements`, `appState`, `files` with images as data URLs). Excalidraw is MIT-licensed, but the format has no formal specification and changes with Excalidraw releases.

## Decision
Yodo **imports** `.excalidraw` files with a one-way converter; it does not export to `.excalidraw`.

- The converter is a pure function in `web/src/core` (Excalidraw JSON → Yodo document at the current `schemaVersion`). The result is saved like any new drawing, so it gets auto-save, search text and thumbnails for free.
- Shapes, diamonds, ellipses, arrows, lines, free-draw (→ pencil), text, text bound to a shape, arrow bindings (→ attached arrows) and images are mapped to their Yodo equivalents. Colours, stroke width/style, roughness and opacity are kept as close as Yodo supports.
- Images from `files` go into Yodo's image store, deduplicated by content hash (0013).
- Deleted elements (`isDeleted`) are skipped. Element types Yodo cannot represent (e.g. frames, embeds) are skipped or simplified, and the user sees a short summary of what was not imported.
- Parsing is tolerant (unknown fields ignored, missing fields defaulted) and covered by fixture files saved from several Excalidraw versions.

## Alternatives considered
- **Use `.excalidraw` as Yodo's own format** — instant compatibility, but Yodo-only features have no place in it and format changes would follow Excalidraw's releases instead of our own migrations (0013).
- **Two-way: import and export `.excalidraw`** — useful, but export is lossy for Yodo-only features and doubles the mapping and test work. Can be added later in a new ADR if needed.
- **Use Excalidraw's own package to read files** — handles their format changes for us, but pulls a large React UI library into the bundle just to parse JSON.

## Consequences
- Users can move existing Excalidraw drawings into Yodo; moving back to Excalidraw is not supported.
- The converter must follow Excalidraw format changes: new fixture files are added when a new Excalidraw version changes the format.
- Imports can lose details Yodo does not support; the summary makes this visible instead of silent.
- Follow-up: an "Import .excalidraw" entry in the Home import action and file drop, plus the product requirement in `docs/product.md`.
