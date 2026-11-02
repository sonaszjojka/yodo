// Freehand (pencil) strokes: capturing pointer samples and the smoothed path
// the renderer draws through them (ADR 0024).
import type { Point } from '../document/types.ts'
import type { LinearGeometry } from './line.ts'

/** A stroke that has just started: one point at the press, no size yet. */
export function startStroke(start: Point): LinearGeometry {
  return { x: start[0], y: start[1], width: 0, height: 0, points: [[0, 0]] }
}

/**
 * The stroke with world point `point` added at its end. A point closer than
 * `minDistance` (world units) to the last one adds nothing and returns the
 * same stroke, so a slow drag doesn't store a pile of duplicate samples.
 */
export function appendPoint(
  stroke: LinearGeometry,
  point: Point,
  minDistance: number,
): LinearGeometry {
  const next: Point = [point[0] - stroke.x, point[1] - stroke.y]
  const last = stroke.points.at(-1)
  if (last && Math.hypot(next[0] - last[0], next[1] - last[1]) < minDistance) {
    return stroke
  }
  const points = [...stroke.points, next]
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    ...stroke,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points,
  }
}

/** One step of a canvas path, in the same coordinates as the input points. */
export type PathCommand =
  | { type: 'move'; to: Point }
  | { type: 'line'; to: Point }
  | { type: 'quad'; control: Point; to: Point }

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/**
 * A smooth path through `points`: it runs from one midpoint between samples
 * to the next, with the sample in between as the quadratic control point. The
 * curve meets each segment's midpoint at the segment's own direction, so
 * consecutive pieces join without the corners a plain polyline shows.
 */
export function smoothPath(points: readonly Point[]): PathCommand[] {
  const first = points[0]
  if (!first) return []
  const last = points.at(-1)!
  const path: PathCommand[] = [{ type: 'move', to: first }]
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i]!
    path.push({ type: 'quad', control, to: midpoint(control, points[i + 1]!) })
  }
  path.push({ type: 'line', to: last })
  return path
}
