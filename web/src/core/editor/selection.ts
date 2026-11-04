// Pure selection helpers: which element a click picks, what a box selects,
// and the document edits a selection makes (move, resize, delete).
import type { Point, YodoElement } from '../document/types.ts'
import { hitTest } from '../geometry/hit.ts'
import { containsBounds, elementBounds, type Bounds } from '../geometry/rect.ts'
import { scaleElement, type ResizeTransform } from '../geometry/resize.ts'

function insideBox(point: Point, box: Bounds, reach: number) {
  return (
    point[0] >= box.x - reach &&
    point[0] <= box.x + box.width + reach &&
    point[1] >= box.y - reach &&
    point[1] <= box.y + box.height + reach
  )
}

/**
 * The id of the topmost element at `point` (later elements draw on top), or
 * null. A selected element also counts anywhere inside its box, so a
 * transparent shape can be dragged by its empty middle once selected; that is
 * only a fallback, so a shape lying inside it can still be clicked.
 */
export function topmostHit(
  elements: readonly YodoElement[],
  point: Point,
  tolerance: number,
  selectedIds: ReadonlySet<string>,
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    if (hitTest(element, point, tolerance)) return element.id
  }
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    if (
      selectedIds.has(element.id) &&
      insideBox(point, elementBounds(element), tolerance)
    ) {
      return element.id
    }
  }
  return null
}

/**
 * The ids of every element the segment `from`–`to` touches, in document
 * order (the eraser's path between two pointer samples). The segment is
 * sampled every `tolerance` world units, so a fast move cannot skip over a
 * thin line; `from === to` tests the single point.
 */
export function idsAlongPath(
  elements: readonly YodoElement[],
  from: Point,
  to: Point,
  tolerance: number,
): string[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const steps = Math.max(1, Math.ceil(length / tolerance))
  const samples: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    samples.push([
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ])
  }
  return elements
    .filter((element) =>
      samples.some((point) => hitTest(element, point, tolerance)),
    )
    .map((element) => element.id)
}

/** The ids of the elements lying fully inside `box`, in document order. */
export function idsInBox(
  elements: readonly YodoElement[],
  box: Bounds,
): string[] {
  return elements
    .filter((element) => containsBounds(box, elementBounds(element)))
    .map((element) => element.id)
}

/**
 * Shifts the elements in `ids` by (dx, dy). Points are relative to (x, y), so
 * moving the origin moves the whole element. Untouched elements keep their
 * object identity, so later diffing (undo, auto-save) sees what changed.
 */
export function moveElements(
  elements: readonly YodoElement[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): YodoElement[] {
  return elements.map((element) =>
    ids.has(element.id)
      ? { ...element, x: element.x + dx, y: element.y + dy }
      : element,
  )
}

/** Scales the elements in `ids` by `t`; like `moveElements`, others keep their identity. */
export function resizeElements(
  elements: readonly YodoElement[],
  ids: ReadonlySet<string>,
  t: ResizeTransform,
): YodoElement[] {
  return elements.map((element) =>
    ids.has(element.id) ? scaleElement(element, t) : element,
  )
}

/** The elements whose ids are in `ids`, in draw order. */
export function selectedOf(
  elements: readonly YodoElement[],
  ids: ReadonlySet<string>,
): YodoElement[] {
  return elements.filter((element) => ids.has(element.id))
}

export function deleteElements(
  elements: readonly YodoElement[],
  ids: ReadonlySet<string>,
): YodoElement[] {
  return elements.filter((element) => !ids.has(element.id))
}

/** How far a duplicate lands from its original, right and down (world units). */
export const DUPLICATE_OFFSET = 10

/**
 * Copies of the elements in `ids`, each with a new id from `createId` and
 * placed right above its original, `DUPLICATE_OFFSET` away. Copies keep the
 * seed, so they look the same (ADR 0004). Returns the copies' ids in order.
 */
export function duplicateElements(
  elements: YodoElement[],
  ids: ReadonlySet<string>,
  createId: () => string,
): { elements: YodoElement[]; ids: string[] } {
  if (!elements.some((element) => ids.has(element.id))) {
    return { elements, ids: [] }
  }
  const copies: string[] = []
  const result = elements.flatMap((element) => {
    if (!ids.has(element.id)) return [element]
    const copy = {
      ...element,
      id: createId(),
      x: element.x + DUPLICATE_OFFSET,
      y: element.y + DUPLICATE_OFFSET,
    }
    copies.push(copy.id)
    return [element, copy]
  })
  return { elements: result, ids: copies }
}
