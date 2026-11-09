# 0055. Arrowheads at both ends of an arrow, from Excalidraw's set

- Status: Accepted
- Date: 2026-11-09

## Context
Roadmap 4.7 (issue #137), requested by the owner while the ticket was open. An arrow has one fixed head at its end (`endArrowhead: 'arrow' | null`), no head at its start, and nothing in the style bar to change either. The owner asked for a head at both ends, editable from the bar when an arrow is selected, and chose Excalidraw's full set.

## Decision
- **Heads.** `Arrowhead` is one of `arrow`, `bar`, `circle`, `circle_outline`, `triangle`, `triangle_outline`, `diamond`, `diamond_outline`, and the six crow's-foot heads `cardinality_one`, `cardinality_many`, `cardinality_one_or_many`, `cardinality_exactly_one`, `cardinality_zero_or_one`, `cardinality_zero_or_many`: Excalidraw's names. Its legacy `dot` is `circle`, and `crowfoot_one`, `crowfoot_many` and `crowfoot_one_or_many` are the matching `cardinality_*`.
- **Format.** `endArrowhead` is `Arrowhead | null` (widened; every stored value stays valid). `startArrowhead` is new and optional; absent means none, which is how every existing arrow looks. New arrows keep an `arrow` end head and no start head. `schemaVersion` stays 1 (ADR 0013).
- **Unknown values.** In untrusted input (`.yodo` file, paste) an unknown end head is reset to `arrow` and an unknown start head is removed; the arrow is kept (`sanitizeElement`, as for bindings in ADR 0048).
- **Drawing.** `core/geometry/arrowhead.ts` turns a head into plain operations (open path, polygon, circle, each filled or not). The canvas and the SVG export both draw from that list, with the arrow's seed and options, so they agree; filled heads are solid in the stroke colour. A head is at most 20 world units long, and at most 40% of a short segment. The start head follows the start tangent of a curve (ADR 0053). A segment with no length has no head. Heads are not part of the arrow's bounds for culling or the export frame, as before.
- **Editing.** `Editor.setArrowhead(end, head)` changes the selected arrows only, as one undo step. The contextual bar shows a **Start head** and an **End head** control when the selection holds an arrow (value "Mixed" when arrows differ); each opens a popover of none plus the 14 heads, drawn with the same shapes. The style panel has the matching sections. Heads are not part of `ElementStyle`: they are not saved as defaults and not copied by "Copy style", so the stored defaults need no migration.
- **Excalidraw import.** Both heads are mapped with the names above. A name Yodo does not know is shown as the plain arrow and still reported as "Simplified arrowheads".

## What an older build does with a new head
Not bumping `schemaVersion` has a cost for a build that predates this ADR, and it differs by load path: importing a `.yodo` file fails as a whole (`bad-elements`, the elements are checked before sanitising); pasting drops that arrow; a document loaded from IndexedDB or the server keeps the arrow and draws the ordinary end head, because stored documents are only migrated by their envelope. A bump to 2 with an identity migration would make the older build refuse the file in a clear way, but an older build is only ever a hosted page that has not updated yet or a Docker image that has not been pulled, and both ship from the same commit. The cost is accepted; the bump is cheap if that ever changes.

## Alternatives considered
- **Only none and arrow at each end.** Smallest change, but the owner asked for the full set.
- **Heads as style keys** (in `ElementStyle`, copyable and saved as defaults). Reuses the bar's generic code, but changes the persisted defaults and `Copy style` for a property only arrows have.
- **Bump `schemaVersion` to 2.** See above.

## Consequences
- Adding a head later means one entry in `ARROWHEADS`, one case in `arrowheadOps`, one option label, and the import mapping.
- Crow's-foot sizes are drawn from fractions of the head size, so they stay compact; they may need tuning after use.
