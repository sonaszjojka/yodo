# 0051. The text tool always creates free text; labels are edited with the Select tool

- Status: Accepted
- Date: 2026-11-08

## Context
Roadmap 4.4 (issue #134). ADR 0026 says a shape's label is edited by "double-clicking a shape, or clicking it with the text tool". In practice that means free text can never be placed over a shape: with the text tool, a click inside a shape (even a transparent one, because a label counts as a fill for hit-testing) always edits that shape's label. The owner hit this in real use after v1.0.0 (`docs/ux-fixes-plan.md`).

## Decision
With the text tool, a click edits an existing free `text` element under the point, and otherwise starts a new free text, wherever it lands, including inside a shape, a labelled shape or a note. The text tool never edits a label.

A label is edited with the Select tool: double-click the shape (as before) or select one shape and press **Enter** (new). Enter also edits one selected free text. Enter is ignored when focus is in a field or on a button, link or other control, so it never steals native activation.

The core has two targeting rules: `freeTextAt` for the text tool and `textTargetAt` (unchanged) for double-click. `Editor.editSelected()` serves the Enter key. No document, storage or server change; the label itself is still ADR 0026's `label` field.

This supersedes only the clause "or clicking it with the text tool" in ADR 0026. The rest of 0026 and all of 0027 stand.

## Alternatives considered
- **Keep editing the label on click, and use a modifier key for free text.** Hidden and easy to forget; the plain click should do the obvious thing.
- **Create free text only over unfilled shapes.** Inconsistent: the same click would do different things depending on a fill colour.

## Consequences
- Free text can sit on top of a shape, a note or a diagram.
- Free text over a shape is a separate element and does not move or resize with the shape. Group it by selecting both, or use the label for text that belongs to the shape.
- Users who relied on the text tool to label a shape now double-click it or press Enter.
- Enter becomes a canvas shortcut ("Edit the label or text of the selected element") and is listed in the shortcuts dialog.
