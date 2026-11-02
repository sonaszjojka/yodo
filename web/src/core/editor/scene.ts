// What the canvas shows for an editor state: the document with any drag in
// progress applied on top. Pure, so the in-progress views are testable.
import type { YodoElement } from '../document/types.ts'
import type { Bounds } from '../geometry/rect.ts'
import type { EditorState } from './editor.ts'
import { moveElements } from './selection.ts'

export interface Scene {
  /** Elements in draw order, the move preview and the draft included. */
  elements: YodoElement[]
  /** The selected elements as shown (moved, if a move is in progress). */
  selected: YodoElement[]
  marquee: Bounds | null
}

export function sceneOf(state: EditorState): Scene {
  const { document, draft, move, marquee } = state
  const ids = new Set(state.selectedIds)
  const shown = move
    ? moveElements(document.elements, ids, move.dx, move.dy)
    : document.elements
  const elements = draft ? [...shown, draft] : [...shown]
  return {
    elements,
    selected: elements.filter((element) => ids.has(element.id)),
    marquee,
  }
}
