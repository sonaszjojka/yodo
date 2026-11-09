import type { Point, YodoElement } from '../document/types.ts'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The rectangle spanned by a drag from `start` to `end`, normalised so width
 * and height are never negative. With `square`, both sides take the longer
 * drag distance and the square grows toward the cursor.
 */
export function rectFromDrag(
  start: Point,
  end: Point,
  square: boolean,
): Bounds {
  let dx = end[0] - start[0]
  let dy = end[1] - start[1]
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    // Math.sign(0) is 0, so treat a zero delta as positive to keep the side.
    dx = side * (dx < 0 ? -1 : 1)
    dy = side * (dy < 0 ? -1 : 1)
  }
  return {
    x: Math.min(start[0], start[0] + dx),
    y: Math.min(start[1], start[1] + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  }
}

/** A diamond's corners in its box: the midpoints of the box's edges. */
export function diamondPoints({ x, y, width, height }: Bounds): Point[] {
  return [
    [x + width / 2, y],
    [x + width, y + height / 2],
    [x + width / 2, y + height],
    [x, y + height / 2],
  ]
}

/** The largest corner radius of a round shape, in world units. */
export const MAX_CORNER_RADIUS = 32

/**
 * How round a `roundness: 'round'` shape's corners are: a quarter of its
 * shorter side, so small shapes stay shapes, up to `MAX_CORNER_RADIUS`.
 */
export function cornerRadius({ width, height }: Bounds): number {
  return Math.min(
    MAX_CORNER_RADIUS,
    Math.min(Math.abs(width), Math.abs(height)) / 4,
  )
}

/**
 * How round a round diamond's corners are: a tenth of its edge length
 * (`hypot(width / 2, height / 2)`, the same for all four edges), and never
 * more than `cornerRadius`. The curve then cuts at most 5% off the way to a
 * tip, at any size or proportion; the rectangle rule alone cut 11% off a
 * 200x200 diamond and 18% off a 100x100 one, which read as a rounded square
 * (roadmap 4.8).
 */
export function diamondCornerRadius(bounds: Bounds): number {
  const edge = Math.hypot(bounds.width / 2, bounds.height / 2)
  return Math.min(cornerRadius(bounds), edge / 10)
}

/** The point `distance` along the segment from `from` towards `to`. */
function toward(from: Point, to: Point, distance: number): Point {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (length === 0) return from
  const t = distance / length
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

/** One rounded vertex: its curve runs from `start` to `end`, pulled towards `vertex`. */
interface RoundCorner {
  start: Point
  vertex: Point
  end: Point
}

/**
 * The corners of the polygon rounded by `radius`, limited to half the
 * shortest edge so curves never overlap.
 */
function roundCorners(points: readonly Point[], radius: number): RoundCorner[] {
  const n = points.length
  let shortest = Infinity
  for (let i = 0; i < n; i++) {
    const [a, b] = [points[i]!, points[(i + 1) % n]!]
    shortest = Math.min(shortest, Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const r = Math.max(0, Math.min(radius, shortest / 2))
  return points.map((vertex, i) => ({
    start: toward(vertex, points[(i - 1 + n) % n]!, r),
    vertex,
    end: toward(vertex, points[(i + 1) % n]!, r),
  }))
}

/**
 * An SVG path for the closed polygon with each vertex replaced by a
 * quadratic curve that starts and ends `radius` along its two edges (round
 * corners, roadmap 2.2b).
 */
export function roundedPolygonPath(
  points: readonly Point[],
  radius: number,
): string {
  const corners = roundCorners(points, radius)
  const curve = ({ start, vertex, end }: RoundCorner) =>
    `L ${start[0]} ${start[1]} Q ${vertex[0]} ${vertex[1]} ${end[0]} ${end[1]}`
  // Start just after the first vertex; its own curve closes the path.
  const [first, ...rest] = corners
  const parts = [`M ${first!.end[0]} ${first!.end[1]}`]
  for (const corner of rest) parts.push(curve(corner))
  parts.push(curve(first!), 'Z')
  return parts.join(' ')
}

/**
 * The outline `roundedPolygonPath` draws, as a polygon with each curve
 * sampled at `steps` segments: what hit-testing aims at.
 */
export function roundedPolygonOutline(
  points: readonly Point[],
  radius: number,
  steps = 8,
): Point[] {
  const outline: Point[] = []
  for (const { start, vertex, end } of roundCorners(points, radius)) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const [a, b, c] = [(1 - t) ** 2, 2 * (1 - t) * t, t ** 2]
      outline.push([
        a * start[0] + b * vertex[0] + c * end[0],
        a * start[1] + b * vertex[1] + c * end[1],
      ])
    }
  }
  return outline
}

/** The four corners of a box, clockwise from the top-left. */
export function boxCorners({ x, y, width, height }: Bounds): Point[] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]
}

/**
 * The world-space box an element covers. Lines, arrows and pencil strokes
 * measure their points, since those can lie left of or above (x, y); for them
 * `width`/`height` give only the size, not the position.
 */
export function elementBounds(element: YodoElement): Bounds {
  if (!('points' in element) || element.points.length === 0) {
    const { x, y } = element
    return 'points' in element
      ? { x, y, width: 0, height: 0 }
      : { x, y, width: element.width, height: element.height }
  }
  const xs = element.points.map(([dx]) => element.x + dx)
  const ys = element.points.map(([, dy]) => element.y + dy)
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)]
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  }
}

/** The smallest box covering all `boxes`, or null when there are none. */
export function unionBounds(boxes: readonly Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.width))
  const maxY = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Whether `inner` lies entirely within `outer`; touching edges counts. */
export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}
