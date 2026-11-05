import {
  BUILT_IN_STYLE,
  createLinear,
  createNote,
  createPencil,
  createShape,
  NOTE_SIZE,
  randomId,
  type ElementStyle,
  type LinearType,
  type ShapeType,
} from '../document/create.ts'
import type { Point, YodoDocument, YodoElement } from '../document/types.ts'
import { appendPoint, startStroke } from '../geometry/freehand.ts'
import { lineFromDrag } from '../geometry/line.ts'
import {
  handleAt,
  selectionFrame,
  type SelectionFrame,
} from '../geometry/frame.ts'
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
import { createHistory, type HistoryStatus } from '../history/history.ts'
import { createStore, type Store } from '../store/store.ts'
import { estimateMeasure, type Measure } from '../text/layout.ts'
import {
  deleteElements,
  duplicateElements,
  idsAlongPath,
  idsInBox,
  moveElements,
  resizeElements,
  selectedOf,
  topmostHit,
} from './selection.ts'
import { arrange, type LayerOrder } from './layers.ts'
import {
  applyDefaults,
  applyStyle,
  sharedStyle,
  type StylePatch,
} from './style.ts'
import { commitEdit, editFor, textTargetAt, type TextEdit } from './text.ts'

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
  /**
   * The text being edited in the textarea (ADR 0027). The canvas hides it,
   * and the document changes only when the edit is committed.
   */
  editing: TextEdit | null
  /**
   * The ids an eraser drag has passed over, or null with no drag. Like `move`,
   * a preview: the canvas shows them faded, and the document changes once,
   * at pointer up, so the whole drag is one undo step.
   */
  erasing: string[] | null
  /**
   * The style new elements get (ADR 0036). A per-browser preference, not
   * part of the document: changing it is no undo step and no save.
   */
  defaults: ElementStyle
  /**
   * The style "copy style" took (roadmap 2.2b), for "paste style". Editor
   * state only: not saved, and copying it is no document change.
   */
  copiedStyle: StylePatch | null
}

/** Tools that draw an element by dragging. */
export type DrawingTool = ShapeType | LinearType | 'pencil' | 'note'
export type Tool = DrawingTool | 'select' | 'hand' | 'text' | 'eraser'

function isDrawingTool(tool: Tool): tool is DrawingTool {
  return (
    tool !== 'select' && tool !== 'hand' && tool !== 'text' && tool !== 'eraser'
  )
}

/** How close (screen px) a click must be to an element's stroke to hit it. */
export const HIT_TOLERANCE = 6
/** A press moves less than this (screen px) to still count as a click. */
export const DRAG_THRESHOLD = 3
/** Pencil samples closer than this (screen px) to the previous one are dropped. */
export const MIN_SAMPLE_DISTANCE = 1

function isLinear(tool: DrawingTool): tool is LinearType {
  return tool === 'line' || tool === 'arrow'
}

/**
 * The geometry a drag gives the element: a box for shapes, a start point and
 * an offset for lines. Shift squares a box or snaps a line's angle.
 */
function geometryFromDrag(
  tool: ShapeType | LinearType | 'note',
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
  // A line or stroke needs length in any direction; a box needs both sides.
  return 'points' in element
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
  /** A click erases the topmost element under it, a drag everything it passes over. */
  eraserTool: PointerTool
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
  /**
   * Applies `patch` to the selection, each style only where it fits (see
   * `style.ts`). One change, so one undo step; none if nothing changes.
   * With nothing selected it changes the defaults instead (ADR 0036).
   * With `selection`, it does nothing unless that is still the selection
   * (the same `selectedIds` reference): an edit that applies late, such as
   * on blur, must not land on what was selected in the meantime.
   */
  setStyle(patch: StylePatch, options?: { selection?: string[] }): void
  /** Moves the selection in the draw order (layers); one undo step. */
  arrange(order: LayerOrder): void
  /** Adds offset copies of the selection and selects them; one undo step. */
  duplicateSelected(): void
  /** Keeps the style the selection shares (no mixed values) for pasting. */
  copyStyle(): void
  /** Applies the copied style to the selection, where it fits; one undo step. */
  pasteStyle(): void
  /** Copies the selection's shared style into the defaults (ADR 0036). */
  useAsDefault(): void
  /** Whether undo and redo are available, for the bottom bar (ADR 0023). */
  history: Store<HistoryStatus>
  /** Goes back one document change, dropping any drag in progress first. */
  undo(): void
  /** Re-applies the last undone change, dropping any drag in progress first. */
  redo(): void
  /** Changing tool clears the selection. */
  setTool(tool: Tool): void
  setSpaceHeld(held: boolean): void
  /** Pans by a screen-pixel delta, as if dragging the content. */
  panBy(dx: number, dy: number): void
  /** Multiplies the zoom by `factor`, keeping `anchor` in place. */
  zoomAt(anchor: Point, factor: number): void
  /** Sets the zoom (clamped), keeping `anchor` in place. */
  setZoom(zoom: number, anchor: Point): void
  /**
   * With the select tool: edits the text or shape label under `screen`, or
   * starts a new text there on empty space (a line or stroke does nothing).
   */
  doubleClick(screen: Point): void
  /** The textarea's value changed; not a document change until commit. */
  setEditingText(text: string): void
  /**
   * Ends the edit as one document change (ADR 0027): adds, updates or deletes
   * the text, or sets or removes the label. Selects the result, Select tool.
   */
  commitText(): void
  /** Measures text for layout; the canvas one in the app (ADR 0027). */
  measure: Measure
}

export interface EditorOptions {
  /** Defaults to a rough estimate, which is enough for tests. */
  measure?: Measure
  /** The style of new elements; the stored preference in the app (ADR 0036). */
  defaults?: ElementStyle
}

export function createEditor(
  document: YodoDocument,
  { measure = estimateMeasure, defaults = BUILT_IN_STYLE }: EditorOptions = {},
): Editor {
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
    defaults,
    copiedStyle: null,
    move: null,
    resize: null,
    hoverHandle: null,
    marquee: null,
    editing: null,
    erasing: null,
  })

  // Every new document reference is one edit (ADR 0023): drags commit once at
  // pointer up, and the viewport is not in the document (ADR 0022).
  const history = createHistory<YodoDocument>()
  /** The document the history last saw, recorded when it is replaced. */
  let seen = document
  /** Undo or redo is swapping the document: that is not a new step. */
  let restoring = false
  store.subscribe(() => {
    const current = store.getState().document
    if (current === seen) return
    if (!restoring) history.record(seen)
    seen = current
  })

  /** The selected elements, in draw order. */
  function selectedNow(state: EditorState) {
    return selectedOf(state.document.elements, new Set(state.selectedIds))
  }

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
    // A stroke grows sample by sample in pointerMove; Shift doesn't reshape it.
    if (!drag || drag.tool === 'pencil') return
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

  /** Adds a pointer sample to the pencil draft, unless it is too close. */
  function appendSample(point: Point) {
    store.setState((prev) => {
      if (prev.draft?.type !== 'pencil') return prev
      const minDistance = MIN_SAMPLE_DISTANCE / prev.viewport.zoom
      const stroke = appendPoint(prev.draft, point, minDistance)
      // The same geometry back means the sample was dropped: no redraw.
      return stroke === prev.draft
        ? prev
        : { ...prev, draft: { ...prev.draft, ...stroke } }
    })
  }

  const drawTool: PointerTool = {
    pointerDown(pointerId, point, shift) {
      if (drag && !owns(pointerId)) return
      const { tool, defaults: style } = store.getState()
      if (!isDrawingTool(tool)) return
      drag = { pointerId, tool, start: point, last: point, shift }
      // The seed is picked once here and kept for the element's lifetime.
      const draft =
        tool === 'pencil'
          ? createPencil(startStroke(point), undefined, style)
          : isLinear(tool)
            ? createLinear(
                tool,
                lineFromDrag(point, point, shift),
                undefined,
                style,
              )
            : tool === 'note'
              ? createNote(rectFromDrag(point, point, shift), undefined, style)
              : createShape(
                  tool,
                  rectFromDrag(point, point, shift),
                  undefined,
                  style,
                )
      store.setState((prev) => ({ ...prev, draft }))
    },
    pointerMove(pointerId, point, shift) {
      if (!drag || !owns(pointerId)) return
      drag = { ...drag, last: point, shift }
      if (drag.tool === 'pencil') appendSample(point)
      else updateDraft()
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
        const { draft: dragged } = prev
        if (!dragged) return prev
        // A click with the note tool places a note of the default size
        // centred on the click; a drag sizes it.
        const draft =
          dragged.type === 'note' &&
          Math.max(dragged.width, dragged.height) <
            DRAG_THRESHOLD / prev.viewport.zoom
            ? {
                ...dragged,
                x: ended.start[0] - NOTE_SIZE / 2,
                y: ended.start[1] - NOTE_SIZE / 2,
                width: NOTE_SIZE,
                height: NOTE_SIZE,
              }
            : dragged
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
        // user's new tool and its cleared selection are kept. The pencil
        // stays active for the next stroke, as handwriting takes many.
        if (prev.tool !== ended.tool || ended.tool === 'pencil')
          return committed
        // The new element is selected and Select becomes active, so it can be
        // moved right away (as in Excalidraw).
        const selected = {
          ...committed,
          tool: 'select' as const,
          selectedIds: [draft.id],
        }
        // A new note opens its text for typing at once.
        return draft.type === 'note'
          ? {
              ...selected,
              editing: editFor(draft, ended.start, prev.defaults),
              selectedIds: [],
            }
          : selected
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

  // The frame only changes with the document, selection or zoom; caching it
  // keeps idle pointer moves (60-120 a second) from re-scanning every element.
  let frameCache: {
    document: YodoDocument
    selectedIds: string[]
    zoom: number
    frame: SelectionFrame | null
  } | null = null

  /** The current selection's frame (no drag preview applied), or null. */
  function currentFrame() {
    const { document, selectedIds, viewport } = store.getState()
    const { zoom } = viewport
    const c = frameCache
    if (
      c?.document === document &&
      c.selectedIds === selectedIds &&
      c.zoom === zoom
    ) {
      return c.frame
    }
    const frame =
      selectedIds.length === 0
        ? null
        : selectionFrame(
            selectedOf(document.elements, new Set(selectedIds)),
            1 / zoom,
          )
    frameCache = { document, selectedIds, zoom, frame }
    return frame
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

  /** A text tool press; the edit starts on release (see `pointerUp`). */
  let textPress: { pointerId: number; point: Point } | null = null

  /** What a text click at `point` edits: a text, a shape label, or null for new text. */
  function textTarget(point: Point) {
    const { document, viewport } = store.getState()
    return textTargetAt(document.elements, point, HIT_TOLERANCE / viewport.zoom)
  }

  function startEdit(point: Point, target = textTarget(point)) {
    const editing = editFor(target, point, store.getState().defaults)
    store.setState((prev) => ({
      ...prev,
      editing,
      selectedIds: [],
      hoverHandle: null,
    }))
  }

  function commitText() {
    const { editing } = store.getState()
    if (!editing) return
    store.setState((prev) => {
      const { document, selectId } = commitEdit(
        prev.document,
        editing,
        measure,
        prev.defaults,
      )
      return {
        ...prev,
        document,
        editing: null,
        tool: 'select',
        selectedIds: selectId ? [selectId] : [],
      }
    })
  }

  /** The eraser drag: its pointer and last sample, outside the store like `drag`. */
  let erase: {
    pointerId: number
    last: Point
    /** Passed the drag threshold; until then it is still a click. */
    moved: boolean
  } | null = null

  /** Adds `ids` to the eraser's marks, keeping document order and no repeats. */
  function markErased(ids: string[]) {
    store.setState((prev) => {
      if (!prev.erasing) return prev
      const marked = new Set(prev.erasing)
      const added = ids.filter((id) => !marked.has(id))
      return added.length === 0
        ? prev
        : { ...prev, erasing: [...prev.erasing, ...added] }
    })
  }

  const eraserTool: PointerTool = {
    pointerDown(pointerId, point) {
      if (erase) return
      erase = { pointerId, last: point, moved: false }
      const { document, viewport } = store.getState()
      // A click erases what a click would select: the topmost element only.
      const hitId = topmostHit(
        document.elements,
        point,
        HIT_TOLERANCE / viewport.zoom,
        new Set(),
      )
      store.setState((prev) => ({ ...prev, erasing: hitId ? [hitId] : [] }))
    },
    pointerMove(pointerId, point) {
      if (erase?.pointerId !== pointerId) return
      const { document, viewport } = store.getState()
      const from = erase.last
      // Like the select tool, wait for the threshold so a jittery click stays
      // a click: the path marks everything under it, not just the topmost.
      // `last` stays at the press point until then, so no stretch is skipped.
      if (
        !erase.moved &&
        Math.hypot(point[0] - from[0], point[1] - from[1]) <
          DRAG_THRESHOLD / viewport.zoom
      )
        return
      erase = { pointerId, last: point, moved: true }
      markErased(
        idsAlongPath(
          document.elements,
          from,
          point,
          HIT_TOLERANCE / viewport.zoom,
        ),
      )
    },
    // Shift does nothing to the eraser.
    setShift() {},
    pointerUp(pointerId) {
      if (erase?.pointerId !== pointerId) return
      erase = null
      store.setState((prev) => {
        const marked = prev.erasing ?? []
        if (marked.length === 0) return { ...prev, erasing: null }
        const elements = deleteElements(prev.document.elements, new Set(marked))
        return {
          ...prev,
          erasing: null,
          document: { ...prev.document, elements },
        }
      })
    },
    pointerCancel(pointerId) {
      if (erase?.pointerId === pointerId) eraserTool.cancel()
    },
    cancel() {
      if (!erase) return
      erase = null
      store.setState((prev) => ({ ...prev, erasing: null }))
    },
  }

  /** Pointer events go to every tool; each acts only on the pointer it owns. */
  const tools = [drawTool, selectTool, eraserTool]

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
    if (pan || drag || gesture || erase) return
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

  /** Undo or redo: swaps in the document `step` returns, if any. */
  function travel(step: (current: YodoDocument) => YodoDocument | null) {
    // Commit first, so undo takes back the edit as a whole.
    commitText()
    // A preview (draft, move, resize, box) belongs to the current document;
    // applying it to the restored one would edit the wrong state.
    drawTool.cancel()
    selectTool.cancel()
    eraserTool.cancel()
    const target = step(store.getState().document)
    if (target) {
      const exists = new Set(target.elements.map((element) => element.id))
      restoring = true
      try {
        store.setState((prev) => {
          const kept = prev.selectedIds.filter((id) => exists.has(id))
          return {
            ...prev,
            document: target,
            // Keep the reference when nothing was dropped (stable selectors).
            selectedIds:
              kept.length === prev.selectedIds.length ? prev.selectedIds : kept,
            hoverHandle: null,
          }
        })
      } finally {
        restoring = false
      }
    }
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
    eraserTool,
    pointerDown(pointerId, screen, { button, shift }) {
      // One gesture at a time: ignore new pointers while one is active.
      if (pan || drag || gesture || erase || textPress) return
      // A press anywhere on the canvas ends the edit, and does nothing else.
      if (store.getState().editing) {
        commitText()
        return
      }
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
      } else if (button === PRIMARY_BUTTON && tool === 'eraser') {
        eraserTool.pointerDown(pointerId, toWorld(screen), shift)
      } else if (button === PRIMARY_BUTTON && tool === 'text') {
        // Start on release: the press's own mousedown would otherwise take
        // focus away from the textarea that the edit shows.
        textPress = { pointerId, point: toWorld(screen) }
      }
    },
    pointerMove(pointerId, screen, shift) {
      if (!pan && !drag && !gesture && !erase) {
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
        if (
          owns(pointerId) ||
          gesture?.pointerId === pointerId ||
          erase?.pointerId === pointerId
        )
          pointerAt = screen
        const point = toWorld(screen)
        for (const t of tools) t.pointerMove(pointerId, point, shift)
      }
    },
    pointerUp(pointerId) {
      if (textPress) {
        if (textPress.pointerId !== pointerId) return
        const { point } = textPress
        textPress = null
        startEdit(point)
      } else if (pan) {
        if (pan.pointerId === pointerId) endPan()
      } else {
        for (const t of tools) t.pointerUp(pointerId)
      }
      refreshHover()
    },
    pointerCancel(pointerId) {
      if (textPress?.pointerId === pointerId) textPress = null
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
      textPress = null
      if (!pan && !drag && !gesture && !erase) {
        setSelection([])
        return
      }
      if (pan) endPan()
      drawTool.cancel()
      selectTool.cancel()
      eraserTool.cancel()
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
    setStyle(patch, { selection } = {}) {
      store.setState((prev) => {
        if (selection && selection !== prev.selectedIds) return prev
        if (prev.selectedIds.length === 0) {
          const defaults = applyDefaults(prev.defaults, patch)
          return defaults === prev.defaults ? prev : { ...prev, defaults }
        }
        const document = applyStyle(
          prev.document,
          prev.selectedIds,
          patch,
          measure,
        )
        return document === prev.document ? prev : { ...prev, document }
      })
    },
    arrange(order) {
      store.setState((prev) => {
        const elements = arrange(
          prev.document.elements,
          new Set(prev.selectedIds),
          order,
        )
        return elements === prev.document.elements
          ? prev
          : { ...prev, document: { ...prev.document, elements } }
      })
    },
    duplicateSelected() {
      store.setState((prev) => {
        const { elements, ids } = duplicateElements(
          prev.document.elements,
          new Set(prev.selectedIds),
          randomId,
        )
        return ids.length === 0
          ? prev
          : {
              ...prev,
              selectedIds: ids,
              hoverHandle: null,
              document: { ...prev.document, elements },
            }
      })
    },
    copyStyle() {
      store.setState((prev) => {
        const copied = sharedStyle(selectedNow(prev))
        // Nothing shared (or nothing selected): an empty copy would enable
        // Paste that does nothing and replace a useful earlier copy.
        return Object.keys(copied).length === 0
          ? prev
          : { ...prev, copiedStyle: copied }
      })
    },
    pasteStyle() {
      store.setState((prev) => {
        // Not setStyle: with nothing selected that would change the defaults.
        if (!prev.copiedStyle || prev.selectedIds.length === 0) return prev
        const document = applyStyle(
          prev.document,
          prev.selectedIds,
          prev.copiedStyle,
          measure,
        )
        return document === prev.document ? prev : { ...prev, document }
      })
    },
    useAsDefault() {
      store.setState((prev) => {
        if (prev.selectedIds.length === 0) return prev
        const defaults = applyDefaults(
          prev.defaults,
          sharedStyle(selectedNow(prev)),
        )
        return defaults === prev.defaults ? prev : { ...prev, defaults }
      })
    },
    history: history.status,
    undo: () => travel(history.undo),
    redo: () => travel(history.redo),
    setTool(tool) {
      commitText()
      if (store.getState().tool === tool) return
      selectTool.cancel()
      eraserTool.cancel()
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
    doubleClick(screen) {
      const { tool, editing, document, viewport } = store.getState()
      if (tool !== 'select' || editing || pan || drag || gesture || erase)
        return
      const point = toWorld(screen)
      // One target for the whole decision, from what is really under the
      // point (not a selected element's box, which may cover a shape).
      const target = textTarget(point)
      if (!target) {
        const hitId = topmostHit(
          document.elements,
          point,
          HIT_TOLERANCE / viewport.zoom,
          new Set(),
        )
        // Lines, arrows and strokes have no text yet.
        if (hitId) return
      }
      startEdit(point, target)
    },
    setEditingText(text) {
      store.setState((prev) =>
        prev.editing && prev.editing.text !== text
          ? { ...prev, editing: { ...prev.editing, text } }
          : prev,
      )
    },
    commitText,
    measure,
  }
}
