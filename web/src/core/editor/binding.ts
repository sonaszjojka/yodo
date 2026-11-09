// Attached arrows (roadmap 3.4, ADR 0048): where an arrow end snaps on a
// shape, and how the arrows follow when a shape moves, resizes or goes away.
// Pure: the editor's drawing and the move/resize/delete helpers build on it.
import type {
  ArrowBinding,
  ArrowElement,
  PathBinding,
  Point,
  ShapeBinding,
  YodoElement,
} from '../document/types.ts'
import { flattenCurve, isCurved } from '../geometry/curve.ts'
import type { LinearElement } from '../geometry/frame.ts'
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

/** The lines and arrows an arrow can attach to (ADR 0054). */
export type PathElement = Extract<YodoElement, { type: 'line' | 'arrow' }>

export function isPathTarget(element: YodoElement): element is PathElement {
  return element.type === 'line' || element.type === 'arrow'
}

/** Anything an arrow end can attach to. */
export type BindTarget = BindableElement | PathElement

/**
 * The topmost shape, line or arrow an arrow end dropped at `point` attaches
 * to. The empty middle of a transparent shape counts, so the end can land
 * anywhere on it; a line or arrow counts within `tolerance` of its path.
 */
export function bindableAt(
  elements: readonly YodoElement[],
  point: Point,
  tolerance: number,
): BindTarget | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!
    if (
      (isBindable(element) ||
        (isPathTarget(element) && element.points.length > 0)) &&
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
export function bindOutline(element: BindableElement): Point[] {
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
): { point: Point; binding: ShapeBinding } {
  const outline = bindOutline(target)
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

/** The tolerance (world units) a curved target is flattened to. */
const PATH_TOLERANCE = 0.25

/**
 * The drawn path of a line or arrow in world coordinates: its points, or the
 * curve through them flattened when it is curved (ADR 0053).
 */
export function pathPoints(element: PathElement): Point[] {
  const absolute = element.points.map(([dx, dy]): Point => [
    element.x + dx,
    element.y + dy,
  ])
  return isCurved(element) ? flattenCurve(absolute, PATH_TOLERANCE) : absolute
}

function lengthOf(a: Point, b: Point) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/**
 * The point `along` (0 to 1) of the way along the target's drawn length, or
 * null for a target with no points. A path with no length is its first point.
 */
export function pointAlong(target: PathElement, along: number): Point | null {
  const path = pathPoints(target)
  if (path.length === 0) return null
  let total = 0
  for (let i = 1; i < path.length; i++)
    total += lengthOf(path[i - 1]!, path[i]!)
  if (total === 0) return path[0]!
  let remaining = Math.min(1, Math.max(0, along)) * total
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!]
    const length = lengthOf(a, b)
    if (remaining <= length && length > 0) {
      const t = remaining / length
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    }
    remaining -= length
  }
  return path.at(-1)!
}

/**
 * The point on a line or arrow nearest to `point`, and the binding that
 * remembers it as a fraction of the path's length (ADR 0054).
 */
export function snapToPath(
  target: PathElement,
  point: Point,
): { point: Point; binding: PathBinding } {
  const path = pathPoints(target)
  let best: Point = path[0] ?? point
  let bestDistance = Infinity
  let bestLength = 0
  let travelled = 0
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!]
    const candidate = closestOnSegment(point, a, b)
    const distance = lengthOf(candidate, point)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      bestLength = travelled + lengthOf(a, candidate)
    }
    travelled += lengthOf(a, b)
  }
  const along = travelled === 0 ? 0 : Math.min(1, bestLength / travelled)
  return { point: best, binding: { elementId: target.id, along } }
}

/** Snaps `point` onto `target`'s outline or path, whichever it has. */
export function snapToTarget(
  target: BindTarget,
  point: Point,
): { point: Point; binding: ArrowBinding } {
  return isPathTarget(target)
    ? snapToPath(target, point)
    : snapToOutline(target, point)
}

/**
 * `element` with its point `index` put at `world` (and, with `insert`, a new
 * point inserted there first). The origin and size are recomputed so the points
 * stay relative to the first one.
 */
function withPoint<T extends LinearElement>(
  element: T,
  index: number,
  world: Point,
  insert = false,
): T {
  const absolute = element.points.map(([dx, dy]): Point => [
    element.x + dx,
    element.y + dy,
  ])
  if (insert) absolute.splice(index, 0, world)
  else absolute[index] = world
  const [x, y] = absolute[0]!
  const xs = absolute.map((p) => p[0])
  const ys = absolute.map((p) => p[1])
  return {
    ...element,
    x,
    y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: absolute.map(([px, py]): Point => [px - x, py - y]),
  }
}

/**
 * The line or arrow with point `index` moved to `world`. Bends stay; an arrow's
 * ends go through `moveEnd` instead, to keep their bindings in sync (ADR 0053).
 */
export function movePoint<T extends LinearElement>(
  element: T,
  index: number,
  world: Point,
): T {
  return withPoint(element, index, world)
}

/**
 * The two-point line or arrow bent through `world`: a point is inserted there
 * and the element becomes a curve (ADR 0053).
 */
export function bendLine<T extends LinearElement>(element: T, world: Point): T {
  return { ...withPoint(element, 1, world, true), curved: true }
}

function withEnd<T extends LinearElement>(
  element: T,
  end: 'start' | 'end',
  world: Point,
): T {
  return withPoint(
    element,
    end === 'start' ? 0 : element.points.length - 1,
    world,
  )
}

/**
 * The arrow with one end put at `world` and bound to `binding`, or free when
 * `binding` is null. The other end and any bends keep their position and
 * binding (ADR 0052).
 */
export function moveEnd(
  arrow: ArrowElement,
  end: 'start' | 'end',
  world: Point,
  binding: ArrowBinding | null,
): ArrowElement {
  const key = end === 'start' ? 'startBinding' : 'endBinding'
  return withEnd(
    binding ? { ...arrow, [key]: binding } : without(arrow, key),
    end,
    world,
  )
}

/** A handle drag of a line or arrow in progress (ADR 0052, 0053). */
export interface HandleDrag {
  elementId: string
  /** The point being moved; with `insert`, where the new point goes. */
  index: number
  /** The bend handle: insert a point and make the element a curve. */
  insert: boolean
  point: Point
  /** The binding an arrow end gets, or null when it stays free. */
  binding: ArrowBinding | null
}

/** `element` with the drag applied; any other element comes back as it is. */
export function applyHandleDrag(
  element: YodoElement,
  drag: HandleDrag,
): YodoElement {
  if (element.id !== drag.elementId) return element
  if (element.type !== 'arrow' && element.type !== 'line') return element
  if (drag.insert) return bendLine(element, drag.point)
  const last = element.points.length - 1
  if (element.type === 'arrow' && (drag.index === 0 || drag.index === last))
    return moveEnd(
      element,
      drag.index === 0 ? 'start' : 'end',
      drag.point,
      drag.binding,
    )
  return movePoint(element, drag.index, drag.point)
}

/** Where an arrow end dragged to `point` lands. */
export interface EndDrop {
  point: Point
  /** The binding it gets, or null when it stays free. */
  binding: ArrowBinding | null
  /** The shape it attaches to, for the highlight. */
  target: BindTarget | null
}

/** `id` and every arrow that is attached, directly or not, to it. */
function dependantsOf(elements: readonly YodoElement[], id: string) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const e of elements) {
      if (
        e.type === 'arrow' &&
        !ids.has(e.id) &&
        (ids.has(e.startBinding?.elementId ?? '') ||
          ids.has(e.endBinding?.elementId ?? ''))
      ) {
        ids.add(e.id)
        grew = true
      }
    }
  }
  return ids
}

/**
 * Where `end` of `arrow` lands when dragged to `point`: on the outline of the
 * shape under it, on the path of a line or arrow under it, or at `point`
 * itself. The element the other end is attached to is no target, as when
 * drawing; nor is the arrow itself or any arrow attached to it, which would
 * make a loop (ADR 0054).
 */
export function dropEnd(
  elements: readonly YodoElement[],
  arrow: ArrowElement,
  end: 'start' | 'end',
  point: Point,
  tolerance: number,
): EndDrop {
  const other = end === 'start' ? arrow.endBinding : arrow.startBinding
  const loop = dependantsOf(elements, arrow.id)
  const target = bindableAt(
    elements.filter((e) => e.id !== other?.elementId && !loop.has(e.id)),
    point,
    tolerance,
  )
  if (!target) return { point, binding: null, target: null }
  const snap = snapToTarget(target, point)
  return { point: snap.point, binding: snap.binding, target }
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
 * Fixes up the arrows after the elements in `moved` were moved or resized, or
 * those in `edited` had their points changed (`elements` already holds their
 * new geometry):
 * - an end whose target moved or was edited follows it, snapped to the
 *   outline of a shape (on the mirrored side if `flipped` says the resize
 *   flipped that axis) or put at the same fraction along a line or arrow;
 * - an end whose target stayed put while the arrow itself moved is detached;
 * - an end whose target is gone, of the wrong kind, or would make a loop is
 *   detached.
 * An arrow attached to an arrow that follows is resolved after it, so chains
 * end up right (ADR 0054). Elements that need nothing keep their identity.
 */
export function followBindings(
  elements: readonly YodoElement[],
  moved: ReadonlySet<string>,
  /** Axes a resize mirrored: attachments on them swap sides. */
  flipped: { x: boolean; y: boolean } = { x: false, y: false },
  edited: ReadonlySet<string> = new Set(),
): YodoElement[] {
  if (!elements.some((e) => e.type === 'arrow' && hasBinding(e))) {
    return [...elements]
  }
  const byId = new Map(elements.map((e) => [e.id, e]))
  const done = new Map<string, YodoElement>()

  // Arrows are followed after the arrows they hang on. The order is found with
  // a loop, not recursion, so a long chain cannot overflow the stack. An end
  // that points back at an arrow still being visited closes a loop: it is
  // recorded in `loops` and detached.
  const loops = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()
  const order: ArrowElement[] = []
  for (const root of elements) {
    if (root.type !== 'arrow' || !hasBinding(root) || state.has(root.id))
      continue
    const stack: { arrow: ArrowElement; next: number }[] = [
      { arrow: root, next: 0 },
    ]
    state.set(root.id, 'visiting')
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const targets = [frame.arrow.startBinding, frame.arrow.endBinding]
      if (frame.next >= targets.length) {
        state.set(frame.arrow.id, 'done')
        order.push(frame.arrow)
        stack.pop()
        continue
      }
      const binding = targets[frame.next++]
      const target = binding && byId.get(binding.elementId)
      // An edge of the wrong kind is detached later and must not look like a
      // loop.
      if (
        !binding ||
        target?.type !== 'arrow' ||
        !hasBinding(target) ||
        !fitsKind(binding, target)
      )
        continue
      const seen = state.get(target.id)
      if (seen === 'visiting') loops.add(`${frame.arrow.id}:${frame.next - 1}`)
      else if (seen === undefined) {
        state.set(target.id, 'visiting')
        stack.push({ arrow: target, next: 0 })
      }
    }
  }

  function follow(element: ArrowElement): ArrowElement {
    // A file can hold an arrow with no points; there is no end to move.
    if (element.points.length < 2)
      return without(without(element, 'startBinding'), 'endBinding')
    let arrow: ArrowElement = element
    for (const end of ['start', 'end'] as const) {
      const key = end === 'start' ? 'startBinding' : 'endBinding'
      const binding = arrow[key]
      if (!binding) continue
      const original = byId.get(binding.elementId)
      if (
        !original ||
        !fitsKind(binding, original) ||
        loops.has(`${element.id}:${end === 'start' ? 0 : 1}`)
      ) {
        arrow = without(arrow, key)
        continue
      }
      const target = done.get(original.id) ?? original
      if (moved.has(element.id) && !moved.has(target.id)) {
        arrow = without(arrow, key)
      } else if (
        moved.has(target.id) ||
        edited.has(target.id) ||
        target !== original
      ) {
        if ('along' in binding) {
          const world = pointAlong(target as PathElement, binding.along)
          arrow = world ? withEnd(arrow, end, world) : without(arrow, key)
        } else {
          const ratio: Point = [
            flipped.x ? 1 - binding.ratio[0] : binding.ratio[0],
            flipped.y ? 1 - binding.ratio[1] : binding.ratio[1],
          ]
          const world = snapToOutline(
            target as BindableElement,
            pointOf(target, ratio),
          )
          arrow = withEnd({ ...arrow, [key]: world.binding }, end, world.point)
        }
      }
    }
    return arrow
  }

  for (const arrow of order) done.set(arrow.id, follow(arrow))
  return elements.map((e) => done.get(e.id) ?? e)
}

/** Whether `binding` is the right form for `target`: a path or a shape one. */
function fitsKind(binding: ArrowBinding, target: YodoElement) {
  return 'along' in binding ? isPathTarget(target) : isBindable(target)
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
