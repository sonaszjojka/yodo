// What the canvas shows for an editor state: the document with any drag in
// progress applied on top. Pure, so the in-progress views are testable.
import type { YodoElement } from '../document/types.ts'
import type { Bounds } from '../geometry/rect.ts'
import type { EditorState } from './editor.ts'
import { moveElements, resizeElements, selectedOf } from './selection.ts'

export interface Scene {
  /** Elements in draw order, the move/resize preview and the draft included. */
  elements: YodoElement[]
  /** The selected elements as shown (moved or resized, if a drag is in progress). */
  selected: YodoElement[]
  marquee: Bounds | null
}

/**
 * The elements without the text being edited: an edited text is left out and
 * an edited label is taken off its shape, since the textarea shows them
 * (ADR 0027). A new text is not in the document yet, so needs nothing.
 */
function withoutEdited(
  elements: YodoElement[],
  editing: EditorState['editing'],
): YodoElement[] {
  if (!editing || editing.target === 'new') return elements
  return elements.flatMap((element) => {
    if (element.id !== editing.id) return [element]
    if (element.type === 'text') return []
    if (!('label' in element)) return [element]
    const { label: _hidden, ...shape } = element
    return [shape]
  })
}

/** How much of its opacity an element the eraser marked keeps until pointer up. */
export const ERASING_OPACITY = 0.3

/** Fades the elements in `ids`; the others keep their identity. */
function faded(elements: YodoElement[], ids: ReadonlySet<string>) {
  return elements.map((element) =>
    ids.has(element.id)
      ? { ...element, opacity: element.opacity * ERASING_OPACITY }
      : element,
  )
}

export function sceneOf(state: EditorState): Scene {
  const { document, draft, move, resize, marquee, erasing } = state
  const ids = new Set(state.selectedIds)
  let shown = withoutEdited(document.elements, state.editing)
  if (erasing) shown = faded(shown, new Set(erasing))
  if (move) shown = moveElements(shown, ids, move.dx, move.dy)
  if (resize) shown = resizeElements(shown, ids, resize)
  const elements = draft ? [...shown, draft] : [...shown]
  return {
    elements,
    selected: selectedOf(elements, ids),
    marquee,
  }
}
