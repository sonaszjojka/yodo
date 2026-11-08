# 0053. Bendable lines and arrows: an optional `curved` flag and extra points

- Status: Accepted
- Date: 2026-11-08

## Context
Roadmap 4.6 (issue #136). Lines and arrows are polylines (`points` relative to `x`, `y`), drawn with rough.js `linearPath`. Nothing lets the user bend them, and Excalidraw files with round arrows import as polylines. ADR 0052 left curves "for later". The format change must be backward compatible (ADR 0013).

## Decision
- **Format.** `line` and `arrow` get an optional `curved?: true`. With `curved` and at least three points the element is a smooth curve through every point (Catmull-Rom, tension 0, as cubic Béziers: for a segment p1→p2 with neighbours p0 and p3, the end points duplicated, c1 = p1 + (p2 − p0)/6 and c2 = p2 − (p3 − p1)/6; the maths rough.js `curve` uses). Without the flag, or with fewer than three points, it is a polyline as before. The field is optional, so `schemaVersion` stays 1 and old files load unchanged (ADR 0013). `width` and `height` stay the box of the points.
- **Handles.** One selected line or arrow shows a round handle on each point and no box, corner handles or badge (ADR 0052 for arrows, now also lines). A two-point element also shows a hollow mid-handle. Dragging it inserts a point there and sets `curved`; dragging any point moves it. Each drag is one undo step. Only arrow ends bind (ADR 0048, 0052); other points never do.
- **Geometry.** Hit-testing flattens the curve adaptively to a tolerance below the hit reach. Culling and the export frame use the curve's own bounds, because the curve can leave the points' box. The arrowhead follows the end tangent and keeps its size from the last chord.
- **Import.** An Excalidraw line or arrow with `roundness` and at least three points imports as `curved`.

## Alternatives considered
- **A single `bend` control point** — simpler, but one arc only and a lossy Excalidraw import.
- **Straight only** — leaves the issue's bending unmet.
- **Pencil-style midpoint smoothing** — the curve would not pass through the handles.

## Consequences
- A lone line or arrow can no longer be scaled with corner handles (multi-selections still scale), as already accepted for arrows in 0052.
- More points cannot be added to an already curved element yet; follow-up.
- Selection frames and the marquee still use the points' box, a small approximation.
