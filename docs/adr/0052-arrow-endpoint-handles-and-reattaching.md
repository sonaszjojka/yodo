# 0052. Arrow endpoint handles, and re-attaching an arrow by dragging an end

- Status: Accepted
- Date: 2026-11-08

## Context
Roadmap 4.5 (issue #135). ADR 0048 binds an arrow end only while the arrow is drawn, and says existing arrows cannot be re-attached. Nothing on screen shows that an end will attach, and a selected arrow has the generic box frame, so its ends cannot be dragged: the owner saw arrows that "do not attach as expected" (`docs/ux-fixes-plan.md`).

## Decision
- **Endpoint handles.** When exactly one arrow with at least two points is selected, its first and last point get round handles. Pressing one starts an `endpoint` select gesture. The end follows the pointer; over a bindable shape (the ADR 0048 targets, same tolerance as drawing) it snaps to the outline and is bound, otherwise it is free and unbound. The shape bound at the other end is not a target, as when drawing. Bends and the other end stay as they are. The document changes once, on pointer up, so the drag is one undo step.
- **Single-arrow selection look.** For exactly one selected arrow the box outline, corner handles and size badge are not drawn, and the box does not resize it. Lines, shapes and multi-selections keep the box frame. The selection frame itself is still computed, because the style bar is placed from it.
- **Highlight.** While an arrow end is being placed (drawing, or an endpoint drag), and while the arrow tool hovers over a shape, the shape an end would attach to is outlined in the accent colour, along its own outline (rounded corners, ellipse and diamond included). The highlight is editor state, not part of the document, and is not exported.

No document, storage, server or schema change: the bindings are ADR 0048's `startBinding`/`endBinding`.

This supersedes only the sentence "existing arrows cannot be re-attached yet" in ADR 0048. The rest of 0048 stands.

## Alternatives considered
- **Keep the box frame and add endpoint handles on top.** Nothing is lost, but the handles sit on the corner handles of every diagonal arrow.
- **Highlight the target's bounding box.** Simpler, but wrong for ellipses, diamonds and rounded rectangles.

## Consequences
- An arrow can be moved and have its ends dragged, but not scaled by a box. Curves and bend handles come later (roadmap M4).
- Plain lines keep the box frame; they have no bindings.
- A later feature that changes an arrow's ends must go through `moveEnd` (`core/editor/binding.ts`) to keep geometry and bindings in sync.
