# 0036. Keep style defaults and the style panel's place as per-browser preferences

- Status: Accepted
- Date: 2026-11-04

## Context
Roadmap 2.2 adds the style panel. With nothing selected it edits the **defaults for new shapes** (`docs/ui.md`, Editing styles), so the editor needs a current default style; until now `create.ts` hard-coded one (Ink stroke, no fill, width 2, hand-drawn). The panel is also movable and resizable, and "the user decides where it sits", so its place and size are worth keeping too.

Forces:
- Defaults are a choice about *how I draw*, not part of any one drawing. Changing them is not a document change: it must not add an undo step ([0023](0023-undo-redo-document-snapshots.md)) or trigger a save ([0032](0032-auto-save-debounced-serialized.md)).
- The document format is versioned ([0013](0013-drawing-document-format-and-versioning.md)); a field that isn't needed there shouldn't be added.
- Dark mode (2.3) needs a remembered per-user choice as well.
- `localStorage` can be empty, full or throw (private windows, blocked site data), and its contents are untrusted.

## Decision
Style defaults and the panel's layout are **per-browser preferences**, kept outside the document:
- **Core:** `EditorState.defaults` holds the full default style (stroke, background, fill style, width, stroke style, look, opacity, font, size, alignment). Every new element takes its style from it. `setStyle` changes the selected elements, or `defaults` when nothing is selected. A defaults change is a new `defaults` reference, never a new `document`, so it is neither undoable nor saved with the drawing.
- **Persistence:** `web/src/storage/preferences.ts` reads and writes two `localStorage` keys, `yodo.styleDefaults` and `yodo.stylePanel` (open, position, size). Reads validate each field and fall back to the built-in value for anything missing or invalid; every access is wrapped so blocked storage only means nothing is remembered. The editor receives the stored defaults at creation, and the UI writes them back when `defaults` changes.
- Selection edits don't change the defaults; copying a selection's style into them is the explicit "use as default" action (2.2b).

## Alternatives considered
- **Per drawing, in `appState`.** Optional and non-breaking, and synced through the server in self-hosted mode, but each new drawing would start from the built-in style again, which is the opposite of what a default is for.
- **Editor state only.** No persistence code, but the defaults reset on every reload and on opening another drawing.
- **Server-side settings in self-hosted mode.** Would follow the user across browsers, but needs a new API and table for a small convenience; can be added later behind the same module.

## Consequences
- Defaults and the panel's place differ per browser and per origin (the hosted site and a self-hosted server are separate origins); they don't sync between devices.
- `preferences.ts` is the place for later per-browser choices (theme in 2.3), each under its own key.
- Tests create the editor with explicit defaults, so they don't depend on stored preferences.
