import {
  createLinear,
  createShape,
  type LinearType,
  type ShapeType,
} from '../document/create.ts'
import type { Point, YodoDocument, YodoElement } from '../document/types.ts'
import { lineFromDrag } from '../geometry/line.ts'
import { rectFromDrag, type Bounds } from '../geometry/rect.ts'
import {
  canResize,
  flippedHandle,
  resizeTransform,
  type Handle,
  type ResizeTransform,
} from '../geometry/resize.ts'
import {
  clampZoom,
  panBy,
  screenToWorld,
  zoomAt,
  type Viewport,
} from '../geometry/viewport.ts'
import { createStore, type Store } from '../store/store.ts'
import { handleAt, selectionFrame } from './frame.ts'
import {
  deleteElements,
  idsInBox,
  moveElements,
  resizeElements,
  topmostHit,
} from './selection.ts'

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
  /** Selected element ids, in the order they were selected. Not saved. */
  selectedIds: string[]
  /**
   * The offset of a move drag in progress. Like `draft`, the document only
   * changes when the drag ends; until then the scene shows the selection
   * shifted by this (see `scene.ts`).
   */
  move: { dx: number; dy: number } | null
  /**
   * The scale of a resize drag in progress, and the handle dragged (for the
   * cursor). Previewed like `move`; the document changes when the drag ends.
   */
  resize: (ResizeTransform & { handle: Handle }) | null
  /** The selection handle under the pointer, for the cursor. */
  hoverHandle: Handle | null
  /** The box of a box-select drag in progress, in world coordinates. */
  marquee: Bounds | null
}

/** Tools that draw an element by dragging. */
export type DrawingTool = ShapeType | LinearType
export type Tool = DrawingTool | 'select' | 'hand'

function isDrawingTool(tool: Tool): tool is DrawingTool {
  return tool !== 'select' && tool !== 'hand'
}

/** How close (screen px) a click must be to an element's stroke to hit it. */
export const HIT_TOLERANCE = 6
/** A press moves less than this (screen px) to still count as a click. */
export const DRAG_THRESHOLD = 3

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
 * screen coordinates before calling it. Only the pointer that started a drag
 * drives it; events from other pointers (a second finger) are ignored.
 */
export interface PointerTool {
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
  drawTool: PointerTool
  /** Clicks select, drags on a selection move it, drags on empty space box-select. */
  selectTool: PointerTool
  // The input router: screen points (CSS px relative to the canvas). A drag
  // pans with the middle button, the hand tool or Space held; otherwise the
  // primary button goes to the select tool or draws with the active tool.
  pointerDown(
    pointerId: number,
    screen: Point,
    options: { button: number; shift: boolean },
  ): void
  pointerMove(pointerId: number, screen: Point, shift: boolean): void
  pointerUp(pointerId: number): void
  pointerCancel(pointerId: number): void
  setShift(shift: boolean): void
  /** Drops the current drag or pan; with none, clears the selection (Escape). */
  cancel(): void
  /** Removes the selected elements from the document (Delete). */
  deleteSelected(): void
  /** Changing tool clears the selection. */
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
    tool: 'select',
    spaceHeld: false,
    panning: false,
    selectedIds: [],
    move: null,
    resize: null,
    hoverHandle: null,
    marquee: null,
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

  const drawTool: PointerTool = {
    pointerDown(pointerId, point, shift) {
      if (drag && !owns(pointerId)) return
      const { tool } = store.getState()
      if (!isDrawingTool(tool)) return
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
      const ended = drag
      drag = null
      store.setState((prev) => {
        const { draft } = prev
        if (!draft) return prev
        if (!isVisible(draft)) return { ...prev, draft: null }
        const committed = {
          ...prev,
          draft: null,
          document: {
            ...prev.document,
            elements: [...prev.document.elements, draft],
          },
        }
        // A tool picked mid-drag wins: the shape is still drawn, but the
        // user's new tool and its cleared selection are kept.
        if (prev.tool !== ended.tool) return committed
        // The new element is selected and Select becomes active, so it can be
        // moved right away (as in Excalidraw).
        return { ...committed, tool: 'select', selectedIds: [draft.id] }
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

  // The select tool's gesture, decided at pointer down: a resize (pressed on a
  // handle of the selection), a move of the selection (pressed on an element)
  // or a box select (pressed on empty space).
  type SelectGesture =
    | {
        kind: 'resize'
        pointerId: number
        handle: Handle
        /** The selection's geometry when the drag started. */
        box: Bounds
        /** The element under the press, which a click (no drag) selects. */
        hitId: string | null
        start: Point
        /** The latest pointer position, so Shift can re-apply without a move. */
        last: Point
        shift: boolean
        moved: boolean
      }
    | {
        kind: 'move'
        pointerId: number
        start: Point
        /** The element pressed, and whether it was selected before. */
        hitId: string
        wasSelected: boolean
        shift: boolean
        /** Passed the drag threshold; until then it is still a click. */
        moved: boolean
      }
    | {
        kind: 'marquee'
        pointerId: number
        start: Point
        /** The selection the box adds to (kept with Shift, else empty). */
        base: string[]
        /** Passed the drag threshold; until then no box is shown. */
        moved: boolean
      }
  let gesture: SelectGesture | null = null

  function setSelection(selectedIds: string[]) {
    store.setState((prev) =>
      // Clearing an empty selection is not a change; skip the redraw.
      prev.selectedIds.length === 0 && selectedIds.length === 0
        ? prev
        : // The handles moved with the selection; the next move finds them.
          { ...prev, selectedIds, hoverHandle: null },
    )
  }

  /** The current selection's frame (no drag preview applied), or null. */
  function currentFrame() {
    const { document, selectedIds, viewport } = store.getState()
    if (selectedIds.length === 0) return null
    const ids = new Set(selectedIds)
    const selected = document.elements.filter((element) => ids.has(element.id))
    return selectionFrame(selected, 1 / viewport.zoom)
  }

  /**
   * The handle of the selection at `point`, with the frame it belongs to. A
   * handle that only pulls an axis with no size (the top side of a flat line)
   * would resize nothing, so it is left out and the press can move instead.
   */
  function handleUnder(point: Point) {
    const frame = currentFrame()
    if (!frame) return null
    const px = 1 / store.getState().viewport.zoom
    const handle = handleAt(frame.outline, point, px)
    return handle && canResize(frame.box, handle)
      ? { handle, box: frame.box }
      : null
  }

  function updateResize(g: Extract<SelectGesture, { kind: 'resize' }>) {
    const t = resizeTransform(g.box, g.handle, g.start, g.last, g.shift)
    store.setState((prev) => ({
      ...prev,
      // The cursor follows the handle the pointer pulls after a flip.
      resize: { ...t, handle: flippedHandle(g.handle, t) },
    }))
  }

  /**
   * A click (a press with no drag) on `hitId`: Shift toggles it in or out of
   * the selection, a plain click selects only it.
   */
  function clickSelect(hitId: string, shift: boolean) {
    const { selectedIds } = store.getState()
    if (!shift) setSelection([hitId])
    else if (selectedIds.includes(hitId))
      setSelection(selectedIds.filter((id) => id !== hitId))
    else setSelection([...selectedIds, hitId])
  }

  const selectTool: PointerTool = {
    pointerDown(pointerId, point, shift) {
      if (gesture) return
      const { document, selectedIds, viewport } = store.getState()
      const hitId = topmostHit(
        document.elements,
        point,
        HIT_TOLERANCE / viewport.zoom,
        new Set(selectedIds),
      )
      // Handles come first: they may lie over another element. Only a drag
      // resizes; a click there still selects the element under it.
      const grabbed = handleUnder(point)
      if (grabbed) {
        gesture = {
          kind: 'resize',
          pointerId,
          ...grabbed,
          hitId,
          start: point,
          last: point,
          shift,
          moved: false,
        }
        return
      }
      if (hitId) {
        const wasSelected = selectedIds.includes(hitId)
        // A press on a selected element keeps the selection, so all of it can
        // be dragged; whether it was a click is only known at pointer up.
        if (!wasSelected)
          setSelection(shift ? [...selectedIds, hitId] : [hitId])
        gesture = {
          kind: 'move',
          pointerId,
          start: point,
          hitId,
          wasSelected,
          shift,
          moved: false,
        }
      } else {
        const base = shift ? selectedIds : []
        setSelection(base)
        gesture = {
          kind: 'marquee',
          pointerId,
          start: point,
          base,
          moved: false,
        }
      }
    },
    pointerMove(pointerId, point, shift) {
      if (gesture?.pointerId !== pointerId) return
      const { start } = gesture
      const [dx, dy] = [point[0] - start[0], point[1] - start[1]]
      // Every gesture waits for the threshold, so a jittery click stays a click.
      const { zoom } = store.getState().viewport
      if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD / zoom) return
      gesture = { ...gesture, moved: true }
      if (gesture.kind === 'resize') {
        gesture = { ...gesture, last: point, shift }
        updateResize(gesture)
      } else if (gesture.kind === 'move') {
        store.setState((prev) => ({ ...prev, move: { dx, dy } }))
      } else {
        const marquee = rectFromDrag(start, point, false)
        const { base } = gesture
        store.setState((prev) => {
          const inside = idsInBox(prev.document.elements, marquee)
          const added = inside.filter((id) => !base.includes(id))
          return { ...prev, marquee, selectedIds: [...base, ...added] }
        })
      }
    },
    // Shift keeps proportions while resizing; a move has no axis lock yet.
    setShift(shift) {
      if (gesture?.kind !== 'resize' || gesture.shift === shift) return
      gesture = { ...gesture, shift }
      if (gesture.moved) updateResize(gesture)
    },
    pointerUp(pointerId) {
      if (gesture?.pointerId !== pointerId) return
      const ended = gesture
      gesture = null
      if (ended.kind === 'resize' && !ended.moved) {
        if (ended.hitId) clickSelect(ended.hitId, ended.shift)
      } else if (ended.kind === 'resize') {
        // The whole drag becomes one document change.
        store.setState((prev) => {
          if (!prev.resize) return prev
          const elements = resizeElements(
            prev.document.elements,
            new Set(prev.selectedIds),
            prev.resize,
          )
          return {
            ...prev,
            resize: null,
            document: { ...prev.document, elements },
          }
        })
      } else if (ended.kind === 'marquee') {
        store.setState((prev) => ({ ...prev, marquee: null }))
      } else if (ended.moved) {
        // The whole drag becomes one document change.
        store.setState((prev) => {
          if (!prev.move) return prev
          const { dx, dy } = prev.move
          const elements = moveElements(
            prev.document.elements,
            new Set(prev.selectedIds),
            dx,
            dy,
          )
          return {
            ...prev,
            move: null,
            document: { ...prev.document, elements },
          }
        })
      } else if (ended.wasSelected) {
        // A click on a selected element: Shift removes it, a plain click
        // narrows the selection down to it. (An unselected one was selected
        // at pointer down, so it could be dragged.)
        clickSelect(ended.hitId, ended.shift)
      }
    },
    pointerCancel(pointerId) {
      if (gesture?.pointerId === pointerId) selectTool.cancel()
    },
    cancel() {
      if (!gesture) return
      const ended = gesture
      gesture = null
      store.setState((prev) => {
        if (ended.kind === 'resize') return { ...prev, resize: null }
        if (ended.kind === 'move') return { ...prev, move: null }
        return { ...prev, marquee: null, selectedIds: ended.base }
      })
    },
  }

  /** Pointer events go to both tools; each acts only on the pointer it owns. */
  const tools = [drawTool, selectTool]

  // The pan drag, kept outside the store like the draw drag.
  let pan: { pointerId: number; last: Point } | null = null

  /** The pointer's last screen position, to re-read the handle under it. */
  let pointerAt: Point | null = null

  function toWorld(screen: Point) {
    return screenToWorld(store.getState().viewport, screen)
  }

  /**
   * Sets `hoverHandle` (the cursor) to the selection handle under the pointer.
   * Runs on every idle pointer move and after anything that moves the handles
   * while the pointer stays put: a drag ending, a pan or a zoom.
   */
  function refreshHover() {
    if (pan || drag || gesture) return
    const { tool } = store.getState()
    const hover =
      tool === 'select' && pointerAt
        ? (handleUnder(toWorld(pointerAt))?.handle ?? null)
        : null
    store.setState((prev) =>
      prev.hoverHandle === hover ? prev : { ...prev, hoverHandle: hover },
    )
  }

  function setViewport(update: (viewport: Viewport) => Viewport) {
    store.setState((prev) => ({ ...prev, viewport: update(prev.viewport) }))
    refreshHover()
  }

  function endPan() {
    pan = null
    store.setState((prev) =>
      prev.panning ? { ...prev, panning: false } : prev,
    )
  }

  return {
    store,
    drawTool,
    selectTool,
    pointerDown(pointerId, screen, { button, shift }) {
      // One gesture at a time: ignore new pointers while one is active.
      if (pan || drag || gesture) return
      pointerAt = screen
      const { tool, spaceHeld } = store.getState()
      const pans =
        button === MIDDLE_BUTTON ||
        (button === PRIMARY_BUTTON && (tool === 'hand' || spaceHeld))
      if (pans) {
        pan = { pointerId, last: screen }
        store.setState((prev) => ({ ...prev, panning: true }))
      } else if (button === PRIMARY_BUTTON && tool === 'select') {
        selectTool.pointerDown(pointerId, toWorld(screen), shift)
      } else if (button === PRIMARY_BUTTON && isDrawingTool(tool)) {
        drawTool.pointerDown(pointerId, toWorld(screen), shift)
      }
    },
    pointerMove(pointerId, screen, shift) {
      if (!pan && !drag && !gesture) {
        // No drag: track the handle under the pointer for the cursor.
        pointerAt = screen
        refreshHover()
        return
      }
      if (pan) {
        if (pan.pointerId !== pointerId) return
        pointerAt = screen
        const [dx, dy] = [screen[0] - pan.last[0], screen[1] - pan.last[1]]
        pan = { pointerId, last: screen }
        setViewport((v) => panBy(v, dx, dy))
      } else {
        if (owns(pointerId) || gesture?.pointerId === pointerId)
          pointerAt = screen
        const point = toWorld(screen)
        for (const t of tools) t.pointerMove(pointerId, point, shift)
      }
    },
    pointerUp(pointerId) {
      if (pan) {
        if (pan.pointerId === pointerId) endPan()
      } else {
        for (const t of tools) t.pointerUp(pointerId)
      }
      refreshHover()
    },
    pointerCancel(pointerId) {
      if (pan) {
        if (pan.pointerId === pointerId) endPan()
      } else {
        for (const t of tools) t.pointerCancel(pointerId)
      }
      refreshHover()
    },
    setShift(shift) {
      drawTool.setShift(shift)
      selectTool.setShift(shift)
    },
    cancel() {
      if (!pan && !drag && !gesture) {
        setSelection([])
        return
      }
      if (pan) endPan()
      drawTool.cancel()
      selectTool.cancel()
      refreshHover()
    },
    deleteSelected() {
      // End a select drag without cancel(): cancel restores the selection from
      // before a box drag, but Delete removes what is highlighted now.
      gesture = null
      store.setState((prev) => {
        // Drop a move or resize preview or a box; a no-op Delete with none is
        // no change.
        const ended =
          prev.move || prev.resize || prev.marquee
            ? { ...prev, move: null, resize: null, marquee: null }
            : prev
        if (ended.selectedIds.length === 0) return ended
        const elements = deleteElements(
          ended.document.elements,
          new Set(ended.selectedIds),
        )
        return {
          ...ended,
          selectedIds: [],
          hoverHandle: null,
          document: { ...ended.document, elements },
        }
      })
    },
    setTool(tool) {
      if (store.getState().tool === tool) return
      selectTool.cancel()
      store.setState((prev) => ({
        ...prev,
        tool,
        selectedIds: [],
        hoverHandle: null,
      }))
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
