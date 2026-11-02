// Pure selection helpers: which element a click picks, what a box selects,
// and the document edits a selection makes (move, delete).
import type { Point, YodoElement } from '../document/types.ts'
import { hitTest } from '../geometry/hit.ts'
import { containsBounds, elementBounds, type Bounds } from '../geometry/rect.ts'

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
 * null. A selected element counts anywhere inside its box, so a transparent
 * shape can be dragged by its empty middle once selected.
 */
export function topmostHit(
  elements: readonly YodoElement[],
  point: Point,
  tolerance: number,
  selectedIds: ReadonlySet<string>,
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    if (
      hitTest(element, point, tolerance) ||
      (selectedIds.has(element.id) &&
        insideBox(point, elementBounds(element), tolerance))
    ) {
      return element.id
    }
  }
  return null
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

export function deleteElements(
  elements: readonly YodoElement[],
  ids: ReadonlySet<string>,
): YodoElement[] {
  return elements.filter((element) => !ids.has(element.id))
}
