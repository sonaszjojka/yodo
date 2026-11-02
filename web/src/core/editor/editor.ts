import {
  createLinear,
  createShape,
  type LinearType,
  type ShapeType,
} from '../document/create.ts'
import type { Point, YodoDocument, YodoElement } from '../document/types.ts'
import { lineFromDrag } from '../geometry/line.ts'
import { rectFromDrag } from '../geometry/rect.ts'
import {
  clampZoom,
  panBy,
  screenToWorld,
  zoomAt,
  type Viewport,
} from '../geometry/viewport.ts'
import { createStore, type Store } from '../store/store.ts'

export interface EditorState {
  document: YodoDocument
  /**
   * The shape being drawn. It stays out of `document.elements` until the drag
   * ends, so committing it is one change (one undo step later, roadmap 1.7).
   */
  draft: YodoElement | null
  /**
   * The camera. Editor state, not part of `document`, so panning is never a
   * document change (ADR 0022); saving copies it into `appState` (1.14).
   */
  viewport: Viewport
  tool: Tool
  /** Space is held: the next drag pans, whatever the tool. */
  spaceHeld: boolean
  /** A pan drag is in progress (shows the grabbing cursor). */
  panning: boolean
}

/** Tools that draw an element by dragging. */
export type DrawingTool = ShapeType | LinearType
export type Tool = DrawingTool | 'hand'

function isLinear(tool: DrawingTool): tool is LinearType {
  return tool === 'line' || tool === 'arrow'
}

/**
 * The geometry a drag gives the element: a box for shapes, a start point and
 * an offset for lines. Shift squares a box or snaps a line's angle.
 */
function geometryFromDrag(
  tool: DrawingTool,
  start: Point,
  end: Point,
  shift: boolean,
) {
  return isLinear(tool)
    ? lineFromDrag(start, end, shift)
    : rectFromDrag(start, end, shift)
}

/** A click or a degenerate drag draws nothing. */
function isVisible(element: YodoElement) {
  // A line needs length in any direction; a box needs both sides.
  return element.type === 'line' || element.type === 'arrow'
    ? Math.hypot(element.width, element.height) >= 1
    : element.width >= 1 && element.height >= 1
}

/** Mouse buttons as in `PointerEvent.button`. */
const PRIMARY_BUTTON = 0
const MIDDLE_BUTTON = 1

/**
 * Pointer input in world coordinates; the editor's router converts from
 * screen coordinates before calling it. Only the pointer that started a drag drives it; events from other pointers
 * (a second finger) are ignored.
 */
export interface DrawTool {
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
  /** Draws with the active tool; which element it makes is fixed at pointer down. */
  drawTool: DrawTool
  // The input router: screen points (CSS px relative to the canvas). A drag
  // pans with the middle button, the hand tool or Space held; otherwise the
  // primary button draws with the active tool.
  pointerDown(
    pointerId: number,
    screen: Point,
    options: { button: number; shift: boolean },
  ): void
  pointerMove(pointerId: number, screen: Point, shift: boolean): void
  pointerUp(pointerId: number): void
  pointerCancel(pointerId: number): void
  setShift(shift: boolean): void
  /** Drops the current drag or pan (Escape). */
  cancel(): void
  setTool(tool: Tool): void
  setSpaceHeld(held: boolean): void
  /** Pans by a screen-pixel delta, as if dragging the content. */
  panBy(dx: number, dy: number): void
  /** Multiplies the zoom by `factor`, keeping `anchor` in place. */
  zoomAt(anchor: Point, factor: number): void
  /** Sets the zoom (clamped), keeping `anchor` in place. */
  setZoom(zoom: number, anchor: Point): void
}

export function createEditor(document: YodoDocument): Editor {
  const store = createStore<EditorState>({
    document,
    draft: null,
    // The format only promises a finite zoom; 0 or negative would break
    // screenToWorld, so bring it into range like every other zoom change.
    viewport: {
      ...document.appState.viewport,
      zoom: clampZoom(document.appState.viewport.zoom),
    },
    tool: 'rectangle',
    spaceHeld: false,
    panning: false,
  })

  // Transient drag data that nothing renders, so it lives outside the store.
  let drag: {
    pointerId: number
    tool: DrawingTool
    start: Point
    last: Point
    shift: boolean
  } | null = null

  function owns(pointerId: number) {
    return drag?.pointerId === pointerId
  }

  function updateDraft() {
    if (!drag) return
    const geometry = geometryFromDrag(
      drag.tool,
      drag.start,
      drag.last,
      drag.shift,
    )
    store.setState((prev) =>
      prev.draft ? { ...prev, draft: { ...prev.draft, ...geometry } } : prev,
    )
  }

  const drawTool: DrawTool = {
    pointerDown(pointerId, point, shift) {
      if (drag && !owns(pointerId)) return
      const { tool } = store.getState()
      if (tool === 'hand') return
      drag = { pointerId, tool, start: point, last: point, shift }
      // The seed is picked once here and kept for the element's lifetime.
      const draft = isLinear(tool)
        ? createLinear(tool, lineFromDrag(point, point, shift))
        : createShape(tool, rectFromDrag(point, point, shift))
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
        return {
          ...prev,
          draft: null,
          document: isVisible(draft)
            ? {
                ...prev.document,
                elements: [...prev.document.elements, draft],
              }
            : prev.document,
        }
      })
    },
    pointerCancel(pointerId) {
      if (owns(pointerId)) drawTool.cancel()
    },
    cancel() {
      if (!drag) return
      drag = null
      store.setState((prev) => ({ ...prev, draft: null }))
    },
  }

  // The pan drag, kept outside the store like the draw drag.
  let pan: { pointerId: number; last: Point } | null = null

  function setViewport(update: (viewport: Viewport) => Viewport) {
    store.setState((prev) => ({ ...prev, viewport: update(prev.viewport) }))
  }

  function endPan() {
    pan = null
    store.setState((prev) =>
      prev.panning ? { ...prev, panning: false } : prev,
    )
  }

  function toWorld(screen: Point) {
    return screenToWorld(store.getState().viewport, screen)
  }

  return {
    store,
    drawTool,
    pointerDown(pointerId, screen, { button, shift }) {
      // One gesture at a time: ignore new pointers while one is active.
      if (pan || drag) return
      const { tool, spaceHeld } = store.getState()
      const pans =
        button === MIDDLE_BUTTON ||
        (button === PRIMARY_BUTTON && (tool === 'hand' || spaceHeld))
      if (pans) {
        pan = { pointerId, last: screen }
        store.setState((prev) => ({ ...prev, panning: true }))
      } else if (button === PRIMARY_BUTTON && tool !== 'hand') {
        drawTool.pointerDown(pointerId, toWorld(screen), shift)
      }
    },
    pointerMove(pointerId, screen, shift) {
      if (pan) {
        if (pan.pointerId !== pointerId) return
        const [dx, dy] = [screen[0] - pan.last[0], screen[1] - pan.last[1]]
        pan = { pointerId, last: screen }
        setViewport((v) => panBy(v, dx, dy))
      } else {
        drawTool.pointerMove(pointerId, toWorld(screen), shift)
      }
    },
    pointerUp(pointerId) {
      if (pan) {
        if (pan.pointerId === pointerId) endPan()
      } else {
        drawTool.pointerUp(pointerId)
      }
    },
    pointerCancel(pointerId) {
      if (pan) {
        if (pan.pointerId === pointerId) endPan()
      } else {
        drawTool.pointerCancel(pointerId)
      }
    },
    setShift: (shift) => drawTool.setShift(shift),
    cancel() {
      if (pan) endPan()
      drawTool.cancel()
    },
    setTool(tool) {
      store.setState((prev) => (prev.tool === tool ? prev : { ...prev, tool }))
    },
    setSpaceHeld(spaceHeld) {
      store.setState((prev) =>
        prev.spaceHeld === spaceHeld ? prev : { ...prev, spaceHeld },
      )
    },
    panBy: (dx, dy) => setViewport((v) => panBy(v, dx, dy)),
    zoomAt: (anchor, factor) =>
      setViewport((v) => zoomAt(v, anchor, v.zoom * factor)),
    setZoom: (zoom, anchor) => setViewport((v) => zoomAt(v, anchor, zoom)),
  }
}
