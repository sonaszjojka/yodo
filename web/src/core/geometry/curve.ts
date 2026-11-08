// Bendable lines and arrows (ADR 0053): a line or arrow with `curved` and at
// least three points is a smooth curve through every point. Pure geometry; the
// renderers, hit-testing and the export frame all read the curve from here.
import type {
  ArrowElement,
  LineElement,
  Point,
  YodoElement,
} from '../document/types.ts'
import { elementBounds, type Bounds } from './rect.ts'

/** Whether `element` is drawn as a curve rather than a polyline. */
export function isCurved(
  element: YodoElement,
): element is (LineElement | ArrowElement) & { curved: true } {
  return (
    (element.type === 'line' || element.type === 'arrow') &&
    element.curved === true &&
    element.points.length >= 3
  )
}

export interface CubicSegment {
  from: Point
  c1: Point
  c2: Point
  to: Point
}

/**
 * The cubic Bézier segments of the Catmull-Rom curve through `points` (tension
 * 0, the end points repeated). Same maths as rough.js `curve`.
 */
export function curveSegments(points: readonly Point[]): CubicSegment[] {
  const last = points.length - 1
  const segments: CubicSegment[] = []
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(i - 1, 0)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(i + 2, last)]!
    segments.push({
      from: p1,
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      to: p2,
    })
  }
  return segments
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Distance from `p` to the finite segment `a`-`b`, not to its infinite line. */
function distanceToChord(p: Point, a: Point, b: Point) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared,
          ),
        )
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Splits a cubic at t = 0.5 (de Casteljau). */
function split(s: CubicSegment): [CubicSegment, CubicSegment] {
  const ab = midpoint(s.from, s.c1)
  const bc = midpoint(s.c1, s.c2)
  const cd = midpoint(s.c2, s.to)
  const abc = midpoint(ab, bc)
  const bcd = midpoint(bc, cd)
  const mid = midpoint(abc, bcd)
  return [
    { from: s.from, c1: ab, c2: abc, to: mid },
    { from: mid, c1: bcd, c2: cd, to: s.to },
  ]
}

const MAX_DEPTH = 16

function flattenSegment(
  s: CubicSegment,
  tolerance: number,
  out: Point[],
  depth = 0,
) {
  // A cubic lies within its control polygon, so when both control points are
  // within `tolerance` of the chord (the segment, so an overshoot past either
  // end counts), the chord is within `tolerance` of it.
  const flat =
    distanceToChord(s.c1, s.from, s.to) <= tolerance &&
    distanceToChord(s.c2, s.from, s.to) <= tolerance
  if (flat || depth >= MAX_DEPTH) {
    out.push(s.to)
    return
  }
  const [a, b] = split(s)
  flattenSegment(a, tolerance, out, depth + 1)
  flattenSegment(b, tolerance, out, depth + 1)
}

/**
 * A polyline that follows the curve through `points` to within `tolerance`
 * (world units), by splitting each segment until it is flat. Adaptive, so a
 * long curve at high zoom is as exact as a short one.
 */
export function flattenCurve(
  points: readonly Point[],
  tolerance: number,
): Point[] {
  if (points.length < 3) return [...points]
  const out: Point[] = [points[0]!]
  for (const segment of curveSegments(points)) {
    flattenSegment(segment, tolerance, out)
  }
  return out
}

/** The tolerance the curve's bounds are measured to, in world units. */
const BOUNDS_TOLERANCE = 0.25

/**
 * The box of the curve itself, in world coordinates. A Catmull-Rom curve can
 * leave the box of its points, so culling and the export frame use this.
 */
export function curveBounds(element: LineElement | ArrowElement): Bounds {
  const absolute = element.points.map(([dx, dy]): Point => [
    element.x + dx,
    element.y + dy,
  ])
  const flat = flattenCurve(absolute, BOUNDS_TOLERANCE)
  // A loop, not Math.min(...xs): a long curve flattens to more samples than a
  // call can take as arguments.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of flat) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Where an arrowhead at the last point should point from, so that it follows
 * the curve's end tangent and keeps the size a straight arrow's head would
 * have: `from` lies on the tangent, one last-chord back from the tip. For a
 * polyline it is just the second to last point. `points` are absolute.
 */
export function headFrom(points: readonly Point[], curved: boolean): Point {
  const tip = points.at(-1)!
  const prev = points.at(-2)!
  if (!curved || points.length < 3) return prev
  const last = curveSegments(points).at(-1)!
  const [tx, ty] = [last.c2[0] - tip[0], last.c2[1] - tip[1]]
  const tangent = Math.hypot(tx, ty)
  const chord = Math.hypot(prev[0] - tip[0], prev[1] - tip[1])
  // The end of a curve that doubles back on itself has no tangent.
  if (tangent === 0) return prev
  return [tip[0] + (tx / tangent) * chord, tip[1] + (ty / tangent) * chord]
}

/**
 * The box of what is drawn for `element`: its points' box, or the curve's own
 * box when it is curved. For culling and the export frame.
 */
export function drawnBounds(element: YodoElement): Bounds {
  return isCurved(element) ? curveBounds(element) : elementBounds(element)
}
