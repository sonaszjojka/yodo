// The selection frame: the outline drawn around the selection and where its
// handles are. The renderer draws it and the select tool hit-tests it, so
// both read these sizes from one place.
import type { Point, YodoElement } from '../document/types.ts'
import { elementBounds, unionBounds, type Bounds } from './rect.ts'
import type { Handle } from './resize.ts'

// Sizes from docs/ui.md "Selection", in screen px.
/** Space between the drawn stroke and the selection outline. */
export const GAP = 4
export const HANDLE_SIZE = 8
/** Extra reach around a corner handle, so it is easy to grab. */
const HANDLE_SLOP = 2
/** How far from an outline side a press still grabs that side. */
const SIDE_REACH = 4

/** rough.js's default `maxRandomnessOffset`: how far, per unit of roughness, a line may wander. */
const ROUGH_OFFSET = 2

/** How far an element's drawn stroke can reach outside its geometry, in world units. */
function strokeReach(element: YodoElement) {
  return element.strokeWidth / 2 + element.roughness * ROUGH_OFFSET
}

export function grow({ x, y, width, height }: Bounds, by: number): Bounds {
  return {
    x: x - by,
    y: y - by,
    width: width + 2 * by,
    height: height + 2 * by,
  }
}

export interface SelectionFrame {
  /** The geometry of the selection: what resizing scales and the badge measures. */
  box: Bounds
  /** Each element's box including its drawn stroke. */
  elementBoxes: Bounds[]
  /** The drawn outline; handles sit on its corners. */
  outline: Bounds
}

/**
 * The frame around `selected`, or null when nothing is selected. `px` is one
 * screen pixel in world units (1 / zoom), so the gap keeps its size on screen.
 */
export function selectionFrame(
  selected: readonly YodoElement[],
  px: number,
): SelectionFrame | null {
  const box = unionBounds(selected.map(elementBounds))
  if (!box) return null
  // The drawn stroke reaches past the geometry; the gap starts past it, or a
  // thick stroke at high zoom would cover the outline.
  const elementBoxes = selected.map((element) =>
    grow(elementBounds(element), strokeReach(element)),
  )
  const outline = grow(unionBounds(elementBoxes)!, GAP * px)
  return { box, elementBoxes, outline }
}

/**
 * The handle at `point` on `outline`, or null. Corners win over sides, so the
 * ends of a side resize diagonally, as the drawn handles suggest. Inside the
 * outline a zone reaches at most a quarter of the way across, so the middle
 * of a small selection (or one at low zoom) still moves it.
 */
export function handleAt(
  outline: Bounds,
  point: Point,
  px: number,
): Handle | null {
  const [x, y] = point
  const left = outline.x
  const right = outline.x + outline.width
  const top = outline.y
  const bottom = outline.y + outline.height
  const capX = outline.width / 4
  const capY = outline.height / 4
  /** `inside` is the distance from an edge towards the outline's middle. */
  const near = (inside: number, reach: number, cap: number) =>
    inside >= -reach && inside <= Math.min(reach, cap)

  const corner = (HANDLE_SIZE / 2 + HANDLE_SLOP) * px
  const nearLeft = near(x - left, corner, capX)
  const nearRight = near(right - x, corner, capX)
  const nearTop = near(y - top, corner, capY)
  const nearBottom = near(bottom - y, corner, capY)
  if (nearTop && nearLeft) return 'nw'
  if (nearTop && nearRight) return 'ne'
  if (nearBottom && nearRight) return 'se'
  if (nearBottom && nearLeft) return 'sw'

  const side = SIDE_REACH * px
  const alongX = x >= left && x <= right
  const alongY = y >= top && y <= bottom
  if (alongX && near(y - top, side, capY)) return 'n'
  if (alongX && near(bottom - y, side, capY)) return 's'
  if (alongY && near(x - left, side, capX)) return 'w'
  if (alongY && near(right - x, side, capX)) return 'e'
  return null
}
