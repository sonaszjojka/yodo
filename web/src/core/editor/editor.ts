import { createRectangle } from '../document/create.ts'
import type {
  Point,
  RectangleElement,
  YodoDocument,
} from '../document/types.ts'
import { rectFromDrag } from '../geometry/rect.ts'
import { createStore, type Store } from '../store/store.ts'

export interface EditorState {
  document: YodoDocument
  /**
   * The shape being drawn. It stays out of `document.elements` until the drag
   * ends, so committing it is one change (one undo step later, roadmap 1.7).
   */
  draft: RectangleElement | null
}

/** Pointer input in world coordinates (screen = world until pan/zoom, 1.3). */
export interface RectangleTool {
  pointerDown(point: Point, shift: boolean): void
  pointerMove(point: Point, shift: boolean): void
  /** Re-applies Shift from the last pointer position, without a move. */
  setShift(shift: boolean): void
  pointerUp(): void
  cancel(): void
}

export interface Editor {
  store: Store<EditorState>
  rectangleTool: RectangleTool
}

export function createEditor(document: YodoDocument): Editor {
  const store = createStore<EditorState>({ document, draft: null })

  // Transient drag data that nothing renders, so it lives outside the store.
  let drag: { start: Point; last: Point; shift: boolean } | null = null

  function updateDraft() {
    if (!drag) return
    const bounds = rectFromDrag(drag.start, drag.last, drag.shift)
    store.setState((prev) =>
      prev.draft ? { ...prev, draft: { ...prev.draft, ...bounds } } : prev,
    )
  }

  const rectangleTool: RectangleTool = {
    pointerDown(point, shift) {
      drag = { start: point, last: point, shift }
      // The seed is picked once here and kept for the element's lifetime.
      const draft = createRectangle(rectFromDrag(point, point, shift))
      store.setState((prev) => ({ ...prev, draft }))
    },
    pointerMove(point, shift) {
      if (!drag) return
      drag = { ...drag, last: point, shift }
      updateDraft()
    },
    setShift(shift) {
      if (!drag || drag.shift === shift) return
      drag = { ...drag, shift }
      updateDraft()
    },
    pointerUp() {
      if (!drag) return
      drag = null
      store.setState((prev) => {
        const { draft } = prev
        if (!draft) return prev
        // A click or a one-axis drag draws nothing.
        const visible = draft.width >= 1 && draft.height >= 1
        return {
          draft: null,
          document: visible
            ? {
                ...prev.document,
                elements: [...prev.document.elements, draft],
              }
            : prev.document,
        }
      })
    },
    cancel() {
      if (!drag) return
      drag = null
      store.setState((prev) => ({ ...prev, draft: null }))
    },
  }

  return { store, rectangleTool }
}
