# 0048. Store attached arrows as bindings on the arrow

- Status: Accepted (the sentence "existing arrows cannot be re-attached yet" is superseded by [0052](0052-arrow-endpoint-handles-and-reattaching.md); "targets are shapes" and the box `ratio` as the only binding form are extended by [0054](0054-arrows-attach-to-lines-and-arrows.md))
- Date: 2026-11-06

## Context
Roadmap 3.4 (`docs/product.md`, "Attached arrows"): an arrow drawn from or to a shape must stay connected when either shape moves or resizes, and the Excalidraw import (ADR 0014) should keep the bindings it used to drop. The document format is versioned (ADR 0013), the server never parses elements, and the renderer, the PNG/SVG export (ADR 0041, 0043) and search read element geometry directly.

## Decision
An arrow gets optional `startBinding` and `endBinding` fields, each `{ elementId, ratio }`. `ratio` is the endpoint's position inside the target's bounding box as fractions. The arrow still stores its real geometry (`x`, `y`, `points`, `width`, `height`) and the editor keeps it in sync, so nothing that draws or exports needs to know about bindings.

- After a move or resize, the endpoint is `box.x + ratio.x * width` (same for y), then snapped again to the target's current outline. The snap is a no-op for plain shapes and keeps the end on the curve of rounded shapes, whose corner radius does not scale with the box.
- Moving or resizing the arrow without its target detaches the moved end. Deleting the target clears the binding and leaves the arrow where it is.
- Duplicate and paste remap a binding to the copied target, or drop it when the target was not copied.
- Only the first and last point of an arrow are bound ends; a bend in between keeps its world position.
- Targets are rectangle, diamond, ellipse, note and image. Bindings are made while drawing an arrow; existing arrows cannot be re-attached yet.
- Malformed bindings in untrusted input (clipboard, `.yodo` file) are stripped and the arrow is kept.
- The Excalidraw import maps `startBinding`/`endBinding` to these fields and reports only the bindings it cannot map.

It is an optional field, so `schemaVersion` stays 1 and no migration is needed (ADR 0013).

## Alternatives considered
- **Excalidraw-style focus and gap** — the end is re-projected towards a focus point on every change. Closer to Excalidraw, but much more geometry code for little visible gain.
- **Always aim at the shape's centre** — no position to store, but the end ignores where the person dropped it.
- **Derive arrow geometry at render time from the bindings** — the arrow would store no endpoints, but the renderer, both exporters and the benchmark would need the element list and the binding logic.

## Consequences
Arrow geometry can briefly disagree with a binding if a future feature changes a shape's box without going through `moveElements`/`resizeElements`; such a feature must call `followBindings`. Re-attaching existing arrows and binding to free text are follow-up work.
