// Resizing a selection: which way each handle pulls, the scale a drag gives,
// and how one element follows that scale.
import type { Point, YodoElement } from '../document/types.ts'
import type { Bounds } from './rect.ts'

/** Corner handles plus the four outline sides, by compass direction. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * Which side of the box each handle moves on each axis: -1 the left/top,
 * 1 the right/bottom, 0 that axis does not follow the pointer.
 */
const PULL: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
}

/**
 * A scale around a fixed point. A negative factor mirrors that axis, which is
 * how dragging a handle past the opposite side flips the selection.
 */
export interface ResizeTransform {
  anchor: Point
  sx: number
  sy: number
}

/**
 * The scale a drag of `handle` from `start` to `point` gives `box`. The anchor
 * is the opposite corner or side; on an axis the handle does not pull, it is
 * the centre, so Shift on a side grows the other axis evenly. Only the
 * pointer's movement counts, so grabbing a handle off-centre causes no jump.
 */
export function resizeTransform(
  box: Bounds,
  handle: Handle,
  start: Point,
  point: Point,
  keepRatio: boolean,
): ResizeTransform {
  const [hx, hy] = PULL[handle]
  const anchor: Point = [
    box.x + (box.width * (1 - hx)) / 2,
    box.y + (box.height * (1 - hy)) / 2,
  ]
  // An axis with no size (a horizontal line's height) cannot be scaled.
  const freeX = hx !== 0 && box.width > 0
  const freeY = hy !== 0 && box.height > 0
  let sx = freeX ? (box.width + hx * (point[0] - start[0])) / box.width : 1
  let sy = freeY ? (box.height + hy * (point[1] - start[1])) / box.height : 1
  if (keepRatio) {
    // The axis pulled furthest wins; each axis keeps its own direction.
    const pulled = [...(freeX ? [sx] : []), ...(freeY ? [sy] : [])]
    const scale = Math.max(...pulled.map(Math.abs), 0) || 1
    sx = freeX ? Math.sign(sx) * scale || scale : scale
    sy = freeY ? Math.sign(sy) * scale || scale : scale
  }
  return { anchor, sx, sy }
}

/** -0 behaves like 0 but shows up in tests and diffs; drop it. */
function noNegativeZero(value: number) {
  return value + 0
}

/**
 * The element scaled by `t`. Boxes are normalised so width and height stay
 * positive after a flip; line points scale (and mirror) around the element's
 * origin. Stroke width is not scaled.
 */
export function scaleElement(
  element: YodoElement,
  { anchor, sx, sy }: ResizeTransform,
): YodoElement {
  const map = (x: number, y: number): Point => [
    anchor[0] + (x - anchor[0]) * sx,
    anchor[1] + (y - anchor[1]) * sy,
  ]
  const [x, y] = map(element.x, element.y)
  if ('points' in element) {
    return {
      ...element,
      x,
      y,
      width: Math.abs(element.width * sx),
      height: Math.abs(element.height * sy),
      points: element.points.map(([px, py]): Point => [
        noNegativeZero(px * sx),
        noNegativeZero(py * sy),
      ]),
    }
  }
  const [x2, y2] = map(element.x + element.width, element.y + element.height)
  return {
    ...element,
    x: Math.min(x, x2),
    y: Math.min(y, y2),
    width: Math.abs(x2 - x),
    height: Math.abs(y2 - y),
  }
}
