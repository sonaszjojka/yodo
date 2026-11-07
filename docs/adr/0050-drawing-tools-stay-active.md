# 0050. Drawing tools stay active until Esc or V

- Status: Accepted
- Date: 2026-11-06

## Context
Roadmap 4.1 (issue #131). Until now the editor switched back to Select and selected the new element after every drawn shape or committed text (the pencil was the exception). Drawing several elements of one kind meant picking the tool again each time, which the owner found slow in real use after v1.0.0.

## Decision
The chosen drawing tool (rectangle, diamond, ellipse, line, arrow, note, text, pencil) stays active after each element, and the new element is not selected. `Esc` with no gesture in progress, or `V`, returns to Select; on Select, `Esc` still clears the selection. Committing a text edit keeps the tool too; only a label edit made with the Select tool (double-click) leaves its element selected, as before.

A tool picked while a drag is in progress still wins: the shape is drawn, but the new tool is kept and a note opens no text editor. Paste, duplicate and image insert still switch to Select and select what they add; they are not drawing tools.

The behaviour lives in `core/editor/editor.ts` (`drawTool.pointerUp`, `commitText`, `cancel`); the toolbar already follows the editor's `tool`. No document, storage or server change.

## Alternatives considered
- **A lock toggle** (sticky only when a button or double-click on the tool turns it on) — keeps the Excalidraw default, but adds UI, a state flag and something to learn, for a behaviour the owner wants all the time.
- **Keep reverting to Select after one element** (Excalidraw's default) — the problem we are fixing.

## Consequences
Drawing many elements is faster. Moving a just-drawn element now needs `Esc` or `V` first, and a stray click with a drawing tool adds an element (zero-size ones are still dropped). If this proves annoying, a lock toggle can be added later on top of this default.
