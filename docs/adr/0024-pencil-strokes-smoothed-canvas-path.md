# 0024. Draw pencil strokes as a smoothed Canvas path, not with rough.js

- Status: Accepted
- Date: 2026-11-02

## Context
Roadmap 1.8 adds the pencil: freehand strokes that "follow the cursor smoothly" (`docs/product.md`). The document format already stores a stroke as a `pencil` element with `points` relative to `(x, y)` (ADR 0013). Everything else is drawn with rough.js (ADR 0004). A freehand stroke is already hand-drawn, and pointer samples arrive as a dense, slightly jagged polyline. Joining them with straight segments shows corners, and rough.js adds its own wobble on top and gets slow on long point lists.

## Decision
Pencil strokes are drawn with the plain Canvas 2D API as one path with constant width, round caps and round joins. The path goes through the midpoints between consecutive samples, using each sample as a quadratic-curve control point, which smooths out the corners without a library.

- `roughness` and `seed` are kept on the element but ignored when drawing a stroke; `strokeColor`, `strokeWidth`, `strokeStyle` and `opacity` apply as usual.
- While drawing, a sample closer than about one screen pixel to the previous one is dropped, so a slow drag doesn't store thousands of duplicate points.
- Hit-testing stays on the raw polyline (ADR 0004 keeps hit-testing in the core). The smoothed curve stays within a fraction of a pixel of it at capture density.
- rough.js stays the renderer for every other element type; this ADR only narrows ADR 0004 for pencil strokes.

## Alternatives considered
- **perfect-freehand** — a variable-width outline that tapers like ink (what Excalidraw uses). Looks best, but it's a new dependency, and the outline polygon must be recomputed on every resize and is harder to hit-test. Could replace this later behind the same `pencil` element if pressure or tapering becomes a requirement.
- **rough.js `curve()`** — keeps one renderer, but roughness adds wobble to a hand-made stroke, and dense point lists render jittery and slowly unless they are simplified first.

## Consequences
- No new dependency; the smoothing is a small pure function in the core with unit tests.
- Strokes have constant width, with no pressure or tapered ends.
- SVG export (later) must draw pencil strokes the same way, not with rough.js's SVG generator.
- The "look" style option (hand-drawn or clean) has no effect on pencil strokes.
