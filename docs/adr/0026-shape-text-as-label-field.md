# 0026. Store text inside a shape as a `label` field on the shape

- Status: Accepted
- Date: 2026-11-02

## Context
Roadmap 1.9 says text "can be placed inside shapes" (`docs/product.md`). Text inside a shape must move, resize, delete and undo together with the shape. The v1 format (ADR 0013) already has a free-standing `text` element, and adding an optional field is not a breaking change.

## Decision
Rectangles, diamonds and ellipses get an optional `label: { text, fontFamily, fontSize, textAlign }`. The label is drawn in the shape's `strokeColor`, centred vertically, and wrapped to the shape's inner box: the full box less padding for a rectangle, the inscribed rectangle for an ellipse or diamond.

- Double-clicking a shape, or clicking it with the text tool, edits its label. Clearing the text removes the label.
- When committed text doesn't fit, the shape grows taller to fit it; a later resize re-wraps the text and may let it overflow.
- A shape with a label can be clicked anywhere inside it, not only on its outline, because the text is something to aim at.
- No schema version bump: old documents have no labels and load unchanged.

## Alternatives considered
- **A text element bound to its shape (`containerId`)**, as Excalidraw does it. The text can be selected and styled on its own, but every move, resize, delete, undo, copy and import must keep the pair in sync and handle a missing container.
- **Unbound text placed at the shape's centre.** Simplest, but it stays put when the shape moves, so it doesn't meet the requirement.

## Consequences
- Move, resize, delete and undo already work on labelled shapes, because a label is part of one element.
- A label can't be selected apart from its shape. Its colour follows the shape's stroke until a separate text colour is needed.
- Sticky notes (2.4) and arrow labels can reuse the same field.
- The Excalidraw importer (ADR 0014) maps bound text to `label`, and the search text (ADR 0013) must include labels.
