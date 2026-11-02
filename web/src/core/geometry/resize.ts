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
 * The smallest a resized side gets, in world units. A side at 0 could never
 * be resized again (an axis with no size cannot scale), and 1 matches the
 * smallest shape a draw commits.
 */
const MIN_SIZE = 1

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
  // The smallest scale per axis that keeps it MIN_SIZE long (0: no size).
  const minX = box.width > 0 ? MIN_SIZE / box.width : 0
  const minY = box.height > 0 ? MIN_SIZE / box.height : 0
  let sx = freeX ? (box.width + hx * (point[0] - start[0])) / box.width : 1
  let sy = freeY ? (box.height + hy * (point[1] - start[1])) / box.height : 1
  if (keepRatio) {
    // The axis pulled furthest wins; each axis keeps its own direction. With
    // no axis to pull, nothing scales.
    const pulled = [...(freeX ? [sx] : []), ...(freeY ? [sy] : [])]
    const scale =
      pulled.length === 0 ? 1 : Math.max(...pulled.map(Math.abs), minX, minY)
    sx = freeX ? (Math.sign(sx) || 1) * scale : scale
    sy = freeY ? (Math.sign(sy) || 1) * scale : scale
  }
  // Shift has already kept both axes at the minimum; this covers a free drag.
  return {
    anchor,
    sx: freeX ? atLeast(sx, minX) : sx,
    sy: freeY ? atLeast(sy, minY) : sy,
  }
}

/** `scale` with its size kept to `min`, its direction kept (0 counts as positive). */
function atLeast(scale: number, min: number) {
  return Math.abs(scale) >= min ? scale : (Math.sign(scale) || 1) * min
}

/** Whether dragging `handle` can change `box`: it pulls an axis that has a size. */
export function canResize(box: Bounds, handle: Handle) {
  const [hx, hy] = PULL[handle]
  return (hx !== 0 && box.width > 0) || (hy !== 0 && box.height > 0)
}

const HANDLES = Object.entries(PULL) as [Handle, [number, number]][]

/**
 * The handle the pointer pulls once `t` has flipped the selection: dragging
 * 'se' past the west side turns it into 'sw'. Used for the cursor.
 */
export function flippedHandle(handle: Handle, { sx, sy }: ResizeTransform) {
  const [hx, hy] = PULL[handle]
  const [fx, fy] = [sx < 0 ? -hx : hx, sy < 0 ? -hy : hy]
  return HANDLES.find(([, [x, y]]) => x === fx && y === fy)![0]
}

/** -0 behaves like 0 but shows up in tests and diffs; drop it. */
function noNegativeZero(value: number) {
  return value + 0
}

/**
 * The element scaled by `t`. Boxes are normalised so width and height stay
 * positive after a flip; line points scale (and mirror) around the element's
 * origin. Stroke width is not scaled, and neither is a shape label's font;
 * text scales its font evenly instead of stretching.
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
  if (element.type === 'text') {
    // Text never stretches or mirrors: it scales evenly, by the geometric
    // mean of both axes, and keeps its top-left at the mapped corner nearest
    // the original one.
    const s = Math.sqrt(Math.abs(sx * sy))
    const width = element.width * s
    const height = element.height * s
    return {
      ...element,
      x: sx < 0 ? x - width : x,
      y: sy < 0 ? y - height : y,
      width,
      height,
      fontSize: element.fontSize * s,
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
