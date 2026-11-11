// create_diagram as a pure function over a document (ADR 0068): nodes sized to
// their labels, placed by the layout, joined by arrows bound at both ends,
// with edge labels as free text beside the arrows. Like the other write
// tools (ADR 0066), every new element must pass validate.ts unchanged.

import {
  createLinear,
  createShape,
  createText,
} from '../../../web/src/core/document/create.ts'
import type {
  ArrowElement,
  DiamondElement,
  EllipseElement,
  Point,
  RectangleElement,
  TextElement,
  YodoDocument,
} from '../../../web/src/core/document/types.ts'
import { snapToTarget } from '../../../web/src/core/editor/binding.ts'
import { withText } from '../../../web/src/core/editor/text.ts'
import { drawnBounds } from '../../../web/src/core/geometry/curve.ts'
import {
  unionBounds,
  type Bounds,
} from '../../../web/src/core/geometry/rect.ts'
import {
  heightForLabel,
  INNER_RATIO,
  LABEL_PADDING,
  layoutText,
  type Measure,
} from '../../../web/src/core/text/layout.ts'
import {
  attempt,
  changed,
  geometryOf,
  idChecker,
  labelled,
  SpecError,
  styleOf,
  type Applied,
} from '../write/apply.ts'
import type { DiagramEdge, DiagramNode } from '../write/spec.ts'
import { layoutGraph, type Direction } from './layout.ts'

export type DiagramSpec = {
  nodes: readonly DiagramNode[]
  edges: readonly DiagramEdge[]
  direction: Direction
  /** The diagram's top-left; by default below what the drawing has. */
  x?: number
  y?: number
}

type Node = RectangleElement | DiamondElement | EllipseElement

/** A label wraps at this width, so a long one makes a taller shape, not a huge one. */
const MAX_LABEL_WIDTH = 240
const MIN_WIDTH = 120
const MIN_HEIGHT = 60
/** Room around a label inside its shape, on each side. */
const SIDE_ROOM = 24
const END_ROOM = 12
/** Room around an edge label that the layout keeps free. */
const LABEL_ROOM = 4
/** The least gap between an edge label and any arrow or shape. */
const LABEL_GAP = 6
/** How far below an existing drawing a new diagram starts. */
const BELOW = 80

const quote = JSON.stringify

/** The size a node's shape needs to hold its label without growing. */
function sizeFor(
  type: Node['type'],
  label: string,
  measure: Measure,
  style: ReturnType<typeof styleOf>,
) {
  const text = layoutText(
    label,
    style.fontFamily,
    style.fontSize,
    measure,
    MAX_LABEL_WIDTH,
  )
  const inner = text.width + 2 * LABEL_PADDING + 2 * SIDE_ROOM
  return {
    width: Math.max(MIN_WIDTH, inner / INNER_RATIO[type]),
    height: Math.max(
      MIN_HEIGHT,
      heightForLabel(type, text.height) + 2 * END_ROOM,
    ),
  }
}

/** Where the diagram starts: the given corner, or below the drawing's content. */
function originOf(doc: YodoDocument, spec: DiagramSpec): Point {
  const content = unionBounds(doc.elements.map(drawnBounds))
  const fallback: Point = content
    ? [content.x, content.y + content.height + BELOW]
    : [0, 0]
  return [spec.x ?? fallback[0], spec.y ?? fallback[1]]
}

/** `points` without the inner points that lie on a straight line. */
function simplify(points: readonly Point[]): Point[] {
  const kept: Point[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const a = kept.at(-1)!
    const p = points[i]!
    const b = points[i + 1]!
    const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
    const span =
      Math.hypot(p[0] - a[0], p[1] - a[1]) *
      Math.hypot(b[0] - p[0], b[1] - p[1])
    if (Math.abs(cross) > 1e-6 * Math.max(1, span)) kept.push(p)
  }
  kept.push(points.at(-1)!)
  return kept
}

function grow(b: Bounds, by: number): Bounds {
  return {
    x: b.x - by,
    y: b.y - by,
    width: b.width + 2 * by,
    height: b.height + 2 * by,
  }
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

/** Whether segment a–b touches box `r` (Liang–Barsky clipping). */
function touches(a: Point, b: Point, r: Bounds): boolean {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  const sides: [number, number][] = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.width - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.height - a[1]],
  ]
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
        )
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** The most steps `clearLabel` takes before giving up on a crowded spot. */
const MAX_STEPS = 400

/**
 * `box` moved off every segment in `segments` and every box in `obstacles`
 * by at least LABEL_GAP, pushed along the normal of the nearest segment of its
 * own `route`, away from it. A box already clear stays where it is.
 */
export function clearLabel(
  box: Bounds,
  route: readonly Point[],
  segments: readonly (readonly [Point, Point])[],
  obstacles: readonly Bounds[] = [],
): Bounds {
  const clear = (b: Bounds) => {
    const room = grow(b, LABEL_GAP)
    return (
      !segments.some(([a, c]) => touches(a, c, room)) &&
      !obstacles.some((o) => overlaps(room, o))
    )
  }
  if (clear(box)) return box
  const centre: Point = [box.x + box.width / 2, box.y + box.height / 2]
  let nearest: [Point, Point] = [route[0]!, route[1] ?? route[0]!]
  let best = Infinity
  for (let i = 1; i < route.length; i++) {
    const d = distanceToSegment(centre, route[i - 1]!, route[i]!)
    if (d < best) {
      best = d
      nearest = [route[i - 1]!, route[i]!]
    }
  }
  const [a, b] = nearest
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
  // Away from the segment: the side the box's centre is already on.
  const side = (centre[0] - a[0]) * normal[0] + (centre[1] - a[1]) * normal[1]
  if (side < 0) normal = [-normal[0], -normal[1]]
  for (let step = 1; step <= MAX_STEPS; step++) {
    const moved = {
      ...box,
      x: box.x + normal[0] * step,
      y: box.y + normal[1] * step,
    }
    if (clear(moved)) return moved
  }
  return box
}

/** The diagram's elements on top of the drawing, or an error naming the problem. */
export function addDiagram(
  doc: YodoDocument,
  spec: DiagramSpec,
  measure: Measure,
): Applied {
  return attempt(() => {
    const reserve = idChecker(doc.elements)
    for (const node of spec.nodes) reserve(node.id)
    const nodeIds = new Set(spec.nodes.map((n) => n.id))
    for (const edge of spec.edges) {
      for (const end of [edge.from, edge.to]) {
        if (!nodeIds.has(end)) {
          throw new SpecError(
            `The edge from ${quote(edge.from)} to ${quote(edge.to)} names ${quote(end)}, which isn't a node in this call.`,
          )
        }
      }
      if (edge.from === edge.to) {
        throw new SpecError(
          `An edge can't go from ${quote(edge.from)} to itself.`,
        )
      }
    }
    const edgeIds = spec.edges.map((edge) => reserve(edge.id))

    // Sizes first: the layout spaces real shapes and leaves room for labels.
    const nodeStyles = spec.nodes.map((node) =>
      styleOf({
        strokeColor: node.strokeColor,
        ...(node.backgroundColor && node.backgroundColor !== 'transparent'
          ? { backgroundColor: node.backgroundColor, fillStyle: 'solid' }
          : { backgroundColor: node.backgroundColor }),
      }),
    )
    const sizes = spec.nodes.map((node, i) =>
      sizeFor(node.shape ?? 'rectangle', node.label, measure, nodeStyles[i]!),
    )
    const labelStyle = styleOf({ textAlign: 'center' })
    const labels = spec.edges.map((edge) =>
      edge.label === undefined
        ? undefined
        : withText(
            createText([0, 0], undefined, labelStyle),
            edge.label,
            measure,
          ),
    )

    const layout = layoutGraph(
      spec.nodes.map((node, i) => ({ id: node.id, ...sizes[i]! })),
      spec.edges.map((edge, i) => {
        const label = labels[i]
        return {
          key: edgeIds[i]!,
          from: edge.from,
          to: edge.to,
          ...(label
            ? {
                label: {
                  width: label.width + 2 * LABEL_ROOM,
                  height: label.height + 2 * LABEL_ROOM,
                },
              }
            : {}),
        }
      }),
      spec.direction,
    )
    const [ox, oy] = originOf(doc, spec)
    const at = ([x, y]: Point): Point => [x + ox, y + oy]

    const shapes = new Map<string, Node>()
    spec.nodes.forEach((node, i) => {
      const placed = layout.nodes.get(node.id)!
      const shape = {
        ...createShape(
          node.shape ?? 'rectangle',
          { x: placed.x + ox, y: placed.y + oy, ...sizes[i]! },
          undefined,
          nodeStyles[i],
        ),
        id: node.id,
      }
      shapes.set(node.id, labelled(shape, node.label, {}, measure))
    })

    const arrows: ArrowElement[] = []
    const routes: Point[][] = []
    spec.edges.forEach((edge, i) => {
      const route = layout.edges.get(edgeIds[i]!)!.points.map(at)
      const start = snapToTarget(shapes.get(edge.from)!, route[0]!)
      const end = snapToTarget(shapes.get(edge.to)!, route.at(-1)!)
      const points = simplify([start.point, ...route.slice(1, -1), end.point])
      routes.push(points)
      arrows.push({
        ...createLinear('arrow', geometryOf(points)),
        id: edgeIds[i]!,
        startBinding: start.binding,
        endBinding: end.binding,
        ...(edge.startArrowhead !== undefined
          ? { startArrowhead: edge.startArrowhead }
          : {}),
        ...(edge.endArrowhead !== undefined
          ? { endArrowhead: edge.endArrowhead }
          : {}),
      })
    })

    const segments = routes.flatMap((points) =>
      points.slice(1).map((p, j) => [points[j]!, p] as const),
    )
    const obstacles = [...shapes.values()]
    const texts: TextElement[] = []
    labels.forEach((label, i) => {
      const centre = layout.edges.get(edgeIds[i]!)!.label
      if (!label || !centre) return
      const [cx, cy] = at(centre)
      const box = clearLabel(
        {
          x: cx - label.width / 2,
          y: cy - label.height / 2,
          width: label.width,
          height: label.height,
        },
        routes[i]!,
        segments,
        obstacles,
      )
      texts.push({ ...label, id: reserve(undefined), x: box.x, y: box.y })
    })

    const created = [...shapes.values(), ...arrows, ...texts]
    return changed(
      doc,
      [...doc.elements, ...created],
      created.map((e) => e.id),
    )
  })
}
