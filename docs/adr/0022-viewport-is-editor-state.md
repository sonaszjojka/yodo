# 0022. Keep the viewport in editor state, not in the document

- Status: Accepted
- Date: 2026-11-01

## Context
Pan and zoom (roadmap 1.3) change the viewport (`{ x, y, zoom }`) many times per second while the user scrolls or pinches. The v1 document already has `appState.viewport` (ADR 0013), so a drawing reopens where it was left. Undo/redo (1.7) and auto-save (1.14) will subscribe to the editor store (ADR 0021) and react to document changes. Moving the camera does not change the drawing, so it should not become an undo step or trigger a save of every scroll position.

## Decision
The live viewport is a field of the editor state (`EditorState.viewport`), next to `document`, not inside it. The editor starts it from `document.appState.viewport`. Saving (1.14) copies the current viewport back into `appState`. Panning and zooming never replace `document`, so its reference stays the same.

## Alternatives considered
- **Update `document.appState.viewport` directly** — it is always in sync and persisted for free, but every pan is a new document. Undo would have to filter out viewport-only changes, and auto-save would have to tell camera moves from edits.

## Consequences
- "The document changed" (a new reference) means "the drawing changed", which keeps undo and auto-save simple.
- Saving must read the viewport from editor state, not only from `document`. A unit test pins that pans leave `document` untouched.
- A viewport-only change is not saved until the next save happens. Auto-save (1.14) decides whether a camera move alone triggers a save.
