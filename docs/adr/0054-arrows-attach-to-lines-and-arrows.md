# 0054. Arrows attach to lines and arrows at a point along the path

- Status: Accepted
- Date: 2026-11-09

## Context
Roadmap 4.7 (issue #137). ADR 0048 lets an arrow end bind only to a shape, with a `ratio` of the target's bounding box. A box ratio does not describe a place on a path, and a line or arrow (ADR 0053) can be bent, so the box says little about where its path runs.

## Decision
- **Format.** `ArrowBinding` is one of two forms. The shape form `{ elementId, ratio }` is unchanged. The path form `{ elementId, along }` has `along` between 0 and 1: the fraction of the target's drawn length, measured from its first point. The drawn path is the polyline, or the curve of ADR 0053 flattened to 0.25 world units. It is an optional field, so `schemaVersion` stays 1 and no migration is needed (ADR 0013). An older app reading the file strips a path binding (ADR 0048) and keeps the arrow where it is.
- **Targets.** Lines and arrows join the shapes of ADR 0048. Pencil strokes do not. `bindableAt` finds the topmost target within the hit tolerance of its path; the end snaps to the nearest point of the path (`snapToPath`).
- **Following.** `followBindings` resolves targets before the arrows that hang on them, so a chain (shape, arrow, arrow) ends up right in one pass. The end goes to the same `along` of the target's new path, after the target moves, is resized, or has a point dragged or a bend added (the endpoint drag commits through `followBindings` with the dragged element as `edited`, so it stays one undo step; the live preview does the same). As in ADR 0048, an arrow moved without its target detaches.
- **No loops.** An arrow end cannot attach to the arrow itself or to an arrow attached, directly or not, to it (`dropEnd`). A file or paste that holds a loop anyway is made harmless: `followBindings` detaches the binding that closes it. A binding of the wrong kind for its target (a `ratio` to a line, an `along` to a shape), a missing target or an `along` outside 0 to 1 is detached or stripped as before.
- **Degenerate targets.** A target whose points all coincide counts as its first point (`along` 0). A target with no points detaches.
- **Unchanged.** Delete, duplicate and paste work by `elementId`, so they carry path bindings as they are. The Excalidraw import still binds to shapes only: Excalidraw cannot bind to arrows, and such a binding is reported as "no longer attached".
- **Highlight.** A line or arrow target is outlined along its path, not as a closed shape.

This supersedes the parts of ADR 0048 that say targets are shapes only and that a binding is a box `ratio`. The rest of 0048 and 0052 stands.

## Alternatives considered
- **Segment index and position in the segment.** Stays on its segment while points move, but inserting a bend point (ADR 0053) shifts the indexes of every later segment.
- **No stored position; re-project the old end onto the path on every change.** Needs no new field, but the end drifts a little with every edit and cannot recover.

## Consequences
- An `along` is exact when the target moves or is scaled by the same factor on both axes. Scaled by different factors, or bent, the end keeps its fraction of the length, so it can slide along the target (a corner that was at 0.5 may no longer be there). This is accepted; a test pins it.
- A later feature that changes the points of a line or arrow must call `followBindings` with the element in `edited`, as the endpoint drag does.
- A future target kind (text, groups) needs its own binding form or an entry in `isBindable`.
