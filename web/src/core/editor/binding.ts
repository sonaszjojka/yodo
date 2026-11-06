// Attached arrows (roadmap 3.4, ADR 0048): where an arrow end snaps on a
// shape, and how the arrows follow when a shape moves, resizes or goes away.
// Pure: the editor's drawing and the move/resize/delete helpers build on it.
import type {
  ArrowBinding,
  ArrowElement,
  Point,
  YodoElement,
} from '../document/types.ts'
import { hitTest } from '../geometry/hit.ts'
import {
  boxCorners,
  cornerRadius,
  diamondPoints,
  roundedPolygonOutline,
  type Bounds,
} from '../geometry/rect.ts'

/** The shapes an arrow can attach to. */
export type BindableElement = Extract<
  YodoElement,
  { type: 'rectangle' | 'diamond' | 'ellipse' | 'note' | 'image' }
>

export function isBindable(element: YodoElement): element is BindableElement {
  return (
    element.type === 'rectangle' ||
    element.type === 'diamond' ||
    element.type === 'ellipse' ||
    element.type === 'note' ||
    element.type === 'image'
  )
}

/**
 * The topmost shape an arrow end dropped at `point` attaches to. The empty
 * middle of a transparent shape counts, so the end can land anywhere on it.
 */
export function bindableAt(
  elements: readonly YodoElement[],
  point: Point,
  tolerance: number,
): BindableElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    if (
      isBindable(element) &&
      hitTest({ ...element, backgroundColor: '#000000' }, point, tolerance)
    ) {
      return element
    }
  }
  return null
}

/** Segments per ellipse outline; the chord error stays well under a pixel. */
const ELLIPSE_STEPS = 96

/** The closed outline a shape is drawn with, as a polygon. */
function outlineOf(element: BindableElement): Point[] {
  if (element.type === 'ellipse') {
    const [cx, cy] = [
      element.x + element.width / 2,
      element.y + element.height / 2,
    ]
    return Array.from({ length: ELLIPSE_STEPS }, (_, i): Point => {
      const angle = (i / ELLIPSE_STEPS) * Math.PI * 2
      return [
        cx + (element.width / 2) * Math.cos(angle),
        cy + (element.height / 2) * Math.sin(angle),
      ]
    })
  }
  const corners =
    element.type === 'diamond' ? diamondPoints(element) : boxCorners(element)
  const round =
    (element.type === 'rectangle' || element.type === 'diamond') &&
    element.roundness === 'round'
  return round ? roundedPolygonOutline(corners, cornerRadius(element)) : corners
}

/** The point on segment `a`–`b` closest to `p`. */
function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared,
          ),
        )
  return [a[0] + t * dx, a[1] + t * dy]
}

/** `point` as fractions of the box; a side with no size counts as its middle. */
function ratioOf({ x, y, width, height }: Bounds, point: Point): Point {
  return [
    width > 0 ? (point[0] - x) / width : 0.5,
    height > 0 ? (point[1] - y) / height : 0.5,
  ]
}

/** Where `ratio` lies in the shape's box. */
export function pointOf(element: Bounds, ratio: Point): Point {
  return [
    element.x + ratio[0] * element.width,
    element.y + ratio[1] * element.height,
  ]
}

/**
 * The point on `target`'s outline nearest to `point`, and the binding that
 * remembers it. Inside or outside the shape, the end lands on the edge.
 */
export function snapToOutline(
  target: BindableElement,
  point: Point,
): { point: Point; binding: ArrowBinding } {
  const outline = outlineOf(target)
  let best: Point = point
  let bestDistance = Infinity
  for (let i = 0; i < outline.length; i++) {
    const candidate = closestOnSegment(
      point,
      outline[i]!,
      outline[(i + 1) % outline.length]!,
    )
    const distance = Math.hypot(
      candidate[0] - point[0],
      candidate[1] - point[1],
    )
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return {
    point: best,
    binding: { elementId: target.id, ratio: ratioOf(target, best) },
  }
}

/** The arrow with its first or last point put at `world`, geometry rebuilt. */
function withEnd(
  arrow: ArrowElement,
  end: 'start' | 'end',
  world: Point,
): ArrowElement {
  const absolute = arrow.points.map(([dx, dy]): Point => [
    arrow.x + dx,
    arrow.y + dy,
  ])
  absolute[end === 'start' ? 0 : absolute.length - 1] = world
  const [x, y] = absolute[0]!
  const xs = absolute.map((p) => p[0])
  const ys = absolute.map((p) => p[1])
  return {
    ...arrow,
    x,
    y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: absolute.map(([px, py]): Point => [px - x, py - y]),
  }
}

/**
 * The arrow with its `end` snapped onto `target`'s outline, nearest to where
 * that end is now, and bound to it. Used where an end was placed by hand, such
 * as an Excalidraw import.
 */
export function attachEnd(
  arrow: ArrowElement,
  end: 'start' | 'end',
  target: BindableElement,
): ArrowElement {
  const point = arrow.points[end === 'start' ? 0 : arrow.points.length - 1]!
  const snap = snapToOutline(target, [arrow.x + point[0], arrow.y + point[1]])
  return withEnd(
    {
      ...arrow,
      [end === 'start' ? 'startBinding' : 'endBinding']: snap.binding,
    },
    end,
    snap.point,
  )
}

/**
 * Fixes up the arrows after the elements in `moved` were moved or resized
 * (`elements` already holds their new geometry):
 * - an end whose shape moved follows it, snapped to the shape's outline;
 * - an end whose shape stayed put while the arrow itself moved is detached;
 * - an end whose shape is gone or cannot be attached to is detached.
 * Elements that need nothing keep their object identity.
 */
export function followBindings(
  elements: readonly YodoElement[],
  moved: ReadonlySet<string>,
): YodoElement[] {
  if (!elements.some((e) => e.type === 'arrow' && hasBinding(e))) {
    return [...elements]
  }
  const byId = new Map(elements.map((e) => [e.id, e]))
  return elements.map((element) => {
    if (element.type !== 'arrow' || !hasBinding(element)) return element
    let arrow: ArrowElement = element
    for (const end of ['start', 'end'] as const) {
      const key = end === 'start' ? 'startBinding' : 'endBinding'
      const binding = arrow[key]
      if (!binding) continue
      const target = byId.get(binding.elementId)
      if (!target || !isBindable(target)) {
        arrow = without(arrow, key)
      } else if (moved.has(element.id) && !moved.has(target.id)) {
        arrow = without(arrow, key)
      } else if (moved.has(target.id)) {
        const world = snapToOutline(target, pointOf(target, binding.ratio))
        arrow = withEnd({ ...arrow, [key]: world.binding }, end, world.point)
      }
    }
    return arrow
  })
}

function hasBinding(arrow: ArrowElement) {
  return arrow.startBinding !== undefined || arrow.endBinding !== undefined
}

function without(arrow: ArrowElement, key: 'startBinding' | 'endBinding') {
  const { [key]: _removed, ...rest } = arrow
  return rest as ArrowElement
}

/**
 * The elements with every binding to an id in `deleted` cleared. The arrows
 * stay where they are. Without any such binding, the same array comes back.
 */
export function unbindDeleted(
  elements: readonly YodoElement[],
  deleted: ReadonlySet<string>,
): YodoElement[] {
  const affected = (e: YodoElement) =>
    e.type === 'arrow' &&
    (deleted.has(e.startBinding?.elementId ?? '') ||
      deleted.has(e.endBinding?.elementId ?? ''))
  if (!elements.some(affected)) return elements as YodoElement[]
  return elements.map((element) => {
    if (!affected(element)) return element
    let arrow = element as ArrowElement
    if (deleted.has(arrow.startBinding?.elementId ?? '')) {
      arrow = without(arrow, 'startBinding')
    }
    if (deleted.has(arrow.endBinding?.elementId ?? '')) {
      arrow = without(arrow, 'endBinding')
    }
    return arrow
  })
}

/**
 * Copies of elements for duplicate and paste: a binding follows `idMap`
 * (original id to copy id) to the copied shape, and is dropped when its
 * shape was not copied too.
 */
export function remapBindings(
  copies: readonly YodoElement[],
  idMap: ReadonlyMap<string, string>,
): YodoElement[] {
  return copies.map((element) => {
    if (element.type !== 'arrow' || !hasBinding(element)) return element
    let arrow: ArrowElement = element
    for (const key of ['startBinding', 'endBinding'] as const) {
      const binding = arrow[key]
      if (!binding) continue
      const copied = idMap.get(binding.elementId)
      arrow = copied
        ? { ...arrow, [key]: { ...binding, elementId: copied } }
        : without(arrow, key)
    }
    return arrow
  })
}
