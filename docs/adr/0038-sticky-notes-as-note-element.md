# 0038. Sticky notes are a `note` element with a label, a fixed default colour and a clean look

- Status: Accepted
- Date: 2026-11-05

## Context
Roadmap 2.4 adds sticky notes: a coloured note with text that can be placed, moved, resized and edited (`docs/product.md`). [0026](0026-shape-text-as-label-field.md) already made text inside a shape a `label` field and said notes can reuse it. Three questions remain: what a note is in the document, which colour a new note gets, and how it is drawn.

Forces:
- Adding an element type is not a breaking format change ([0013](0013-drawing-document-format-and-versioning.md)).
- New elements take their style from the editor's defaults ([0036](0036-style-defaults-and-panel-as-browser-preferences.md)), and the built-in default fill is `transparent`, which would make an invisible note.
- Shapes are drawn hand-drawn with rough.js ([0004](0004-rendering-canvas-2d-roughjs.md)); a sticky note is meant to look like a clean paper square.

## Decision
- **A new element type `note`** (`NoteElement`) with an optional `label`, reusing the label code of [0026](0026-shape-text-as-label-field.md) for layout, editing, move, resize and undo. Its colour is `backgroundColor` and its text colour is `strokeColor`. No schema version bump and no migration.
- **The note's colour does not follow the default fill.** A new note is always Sand `#F9EBD6`, and a note's `backgroundColor` is never `transparent`: a style patch that would set it (Paste style from an unfilled shape, for instance) is ignored for notes. A note's colour can still be copied and used as a default like any fill.
- **Notes are drawn with a plain Canvas rounded box and a soft shadow, not rough.js.** This is a second exception to [0004](0004-rendering-canvas-2d-roughjs.md), next to pencil strokes ([0024](0024-pencil-strokes-smoothed-canvas-path.md)).
- Notes offer only text colour, note colour and opacity in the style bar and panel; label font styling is left for a later task, as for shapes.

## Alternatives considered
- **A `rectangle` with a flag** — reuses everything, but mixes the rough look, outline and fill styles into what should be a fixed paper look.
- **A note with its own `text` field** — duplicates the label layout and editing code that already exists.
- **Following the default fill** — consistent with [0036](0036-style-defaults-and-panel-as-browser-preferences.md), but the default is `transparent`, so a new note would be invisible.

## Consequences
- Move, resize, delete and undo work on notes with no new code, because a note is one element.
- Old documents are unaffected; a document with notes opened by an older build would have an unknown element type, which is the usual cost of an additive change.
- The renderer, hit-testing and style code each gain a `note` case.
- Search text (ADR 0013, later task) and the Excalidraw importer (0014) need no change for notes; copy/paste (2.5) gets notes for free.
