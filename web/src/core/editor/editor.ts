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

/**
 * Pointer input in world coordinates (screen = world until pan/zoom, 1.3).
 * Only the pointer that started a drag drives it; events from other pointers
 * (a second finger) are ignored.
 */
export interface RectangleTool {
  pointerDown(pointerId: number, point: Point, shift: boolean): void
  pointerMove(pointerId: number, point: Point, shift: boolean): void
  /** Re-applies Shift from the last pointer position, without a move. */
  setShift(shift: boolean): void
  pointerUp(pointerId: number): void
  /** The browser took the pointer away (e.g. a touch became a scroll). */
  pointerCancel(pointerId: number): void
  /** Drops the current drag, whichever pointer owns it (Escape). */
  cancel(): void
}

export interface Editor {
  store: Store<EditorState>
  rectangleTool: RectangleTool
}

export function createEditor(document: YodoDocument): Editor {
  const store = createStore<EditorState>({ document, draft: null })

  // Transient drag data that nothing renders, so it lives outside the store.
  let drag: {
    pointerId: number
    start: Point
    last: Point
    shift: boolean
  } | null = null

  function owns(pointerId: number) {
    return drag?.pointerId === pointerId
  }

  function updateDraft() {
    if (!drag) return
    const bounds = rectFromDrag(drag.start, drag.last, drag.shift)
    store.setState((prev) =>
      prev.draft ? { ...prev, draft: { ...prev.draft, ...bounds } } : prev,
    )
  }

  const rectangleTool: RectangleTool = {
    pointerDown(pointerId, point, shift) {
      if (drag && !owns(pointerId)) return
      drag = { pointerId, start: point, last: point, shift }
      // The seed is picked once here and kept for the element's lifetime.
      const draft = createRectangle(rectFromDrag(point, point, shift))
      store.setState((prev) => ({ ...prev, draft }))
    },
    pointerMove(pointerId, point, shift) {
      if (!drag || !owns(pointerId)) return
      drag = { ...drag, last: point, shift }
      updateDraft()
    },
    setShift(shift) {
      if (!drag || drag.shift === shift) return
      drag = { ...drag, shift }
      updateDraft()
    },
    pointerUp(pointerId) {
      if (!drag || !owns(pointerId)) return
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
    pointerCancel(pointerId) {
      if (owns(pointerId)) rectangleTool.cancel()
    },
    cancel() {
      if (!drag) return
      drag = null
      store.setState((prev) => ({ ...prev, draft: null }))
    },
  }

  return { store, rectangleTool }
}
