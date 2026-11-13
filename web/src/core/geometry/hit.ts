// Hit-testing: is a world point "on" an element? Rendering happens on a
// canvas, so the core answers this itself (ADR 0004). Like the renderer, it
// ignores `angle` until rotation exists.
import type { Point, YodoElement } from '../document/types.ts'
import {
  boxCorners,
  cornerRadius,
  diamondCornerRadius,
  diamondPoints,
  roundedPolygonOutline,
} from './rect.ts'
import { flattenCurve, isCurved } from './curve.ts'

/** Shortest distance from `p` to the segment `a`–`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const lengthSquared = dx * dx + dy * dy
  // Project p onto the segment's line, clamped to the segment's ends.
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

/** Even-odd rule: count edge crossings of a ray going right from `p`. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

function nearPolyline(p: Point, points: readonly Point[], reach: number) {
  if (points.length === 1)
    return distanceToSegment(p, points[0]!, points[0]!) <= reach
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(p, points[i - 1]!, points[i]!) <= reach) return true
  }
  return false
}

/**
 * Where `p` lies relative to the ellipse with centre `c` and semi-axes `a`,
 * `b`: below 1 inside, 1 on the outline, above 1 outside. A degenerate
 * ellipse (an axis of 0 or less) contains nothing.
 */
function ellipseRadius(p: Point, c: Point, a: number, b: number) {
  if (a <= 0 || b <= 0) return Infinity
  const [nx, ny] = [(p[0] - c[0]) / a, (p[1] - c[1]) / b]
  return nx * nx + ny * ny
}

/**
 * Whether `point` hits `element`, both in world coordinates. `tolerance` is in
 * world units (a caller converts its screen-pixel slop by dividing by zoom),
 * and half the stroke width is added so thick strokes are as easy to hit.
 * A transparent shape hits only near its outline, so clicks pass through its
 * empty middle; a filled or labelled one also hits inside.
 */
export function hitTest(
  element: YodoElement,
  point: Point,
  tolerance: number,
): boolean {
  const reach = tolerance + element.strokeWidth / 2
  // A label is something to aim at, so a labelled shape hits inside too
  // (ADR 0026).
  const filled =
    element.backgroundColor !== 'transparent' ||
    ('label' in element && element.label !== undefined)
  const { x, y, width, height } = element
  const [px, py] = point

  // A round rectangle or diamond is aimed at along its drawn curves.
  if (
    (element.type === 'rectangle' || element.type === 'diamond') &&
    element.roundness === 'round'
  ) {
    const corners =
      element.type === 'rectangle'
        ? boxCorners(element)
        : diamondPoints(element)
    const radius =
      element.type === 'rectangle'
        ? cornerRadius(element)
        : diamondCornerRadius(element)
    const outline = roundedPolygonOutline(corners, radius)
    return (
      nearPolyline(point, [...outline, outline[0]!], reach) ||
      (filled && pointInPolygon(point, outline))
    )
  }

  switch (element.type) {
    case 'rectangle':
    case 'note':
    case 'image':
    case 'text': {
      // Distance from the box, so off a corner the reach is a circle (like
      // the eraser's cursor ring), not a square (#142).
      const outside = Math.hypot(
        Math.max(x - px, 0, px - (x + width)),
        Math.max(y - py, 0, py - (y + height)),
      )
      if (outside > reach) return false
      // Text has no outline to aim at, so its whole box counts.
      if (filled || element.type === 'text' || element.type === 'image') {
        return true
      }
      const inInner =
        px > x + reach &&
        px < x + width - reach &&
        py > y + reach &&
        py < y + height - reach
      return !inInner
    }
    case 'diamond': {
      const corners = diamondPoints(element)
      const closed = [...corners, corners[0]!]
      return (
        nearPolyline(point, closed, reach) ||
        (filled && pointInPolygon(point, corners))
      )
    }
    case 'ellipse': {
      const centre: Point = [x + width / 2, y + height / 2]
      const [a, b] = [width / 2, height / 2]
      // Growing and shrinking the semi-axes by `reach` brackets the outline:
      // exact for circles, a close approximation for flat ellipses.
      if (ellipseRadius(point, centre, a + reach, b + reach) > 1) return false
      return filled || ellipseRadius(point, centre, a - reach, b - reach) >= 1
    }
    case 'line':
    case 'arrow':
    case 'pencil': {
      // Open strokes have no inside, filled or not.
      const absolute = element.points.map(([dx, dy]): Point => [x + dx, y + dy])
      // A curve is tested as a polyline within half the reach of it (ADR 0053).
      return nearPolyline(
        point,
        isCurved(element) ? flattenCurve(absolute, reach / 2) : absolute,
        reach,
      )
    }
  }
}
