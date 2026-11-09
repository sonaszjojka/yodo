// Arrowheads (ADR 0055): the shapes an arrow end can have, as plain drawing
// operations in world coordinates. The canvas and the SVG export both draw
// from this list, so they cannot disagree. Pure; no drawing here.
import type { ArrowElement, Arrowhead, Point } from '../document/types.ts'
import { headFrom, tailFrom } from './curve.ts'
import { ARROWHEAD_LENGTH, MAX_HEAD_SHARE, arrowhead } from './line.ts'

/** One piece of a head. */
export type HeadOp =
  | { kind: 'path'; points: Point[] }
  | { kind: 'polygon'; points: Point[]; filled: boolean }
  | { kind: 'circle'; center: Point; diameter: number; filled: boolean }

/** Half the head's width, as a share of its size, for the wide shapes. */
const HALF_WIDTH = 0.5

/**
 * The head `kind` at `to` for a segment coming from `from`. Nothing for a
 * segment with no length. A head is at most `ARROWHEAD_LENGTH` long, and at
 * most `MAX_HEAD_SHARE` of the segment on short ones.
 */
export function arrowheadOps(
  kind: Arrowhead,
  from: Point,
  to: Point,
): HeadOp[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (length === 0) return []
  if (kind === 'arrow') return [{ kind: 'path', points: arrowhead(from, to) }]
  const size = Math.min(ARROWHEAD_LENGTH, length * MAX_HEAD_SHARE)
  // Unit vectors: `u` points back along the line from the tip, `n` across it.
  const u: Point = [(from[0] - to[0]) / length, (from[1] - to[1]) / length]
  const n: Point = [-u[1], u[0]]
  /** The point `back` along the line from the tip and `side` across it. */
  const at = (back: number, side = 0): Point => [
    to[0] + u[0] * back * size + n[0] * side * size,
    to[1] + u[1] * back * size + n[1] * side * size,
  ]
  const bar = (back: number): HeadOp => ({
    kind: 'path',
    points: [at(back, -0.45), at(back, 0.45)],
  })
  const circle = (back: number, diameter: number, filled: boolean): HeadOp => ({
    kind: 'circle',
    center: at(back + diameter / 2),
    diameter: diameter * size,
    filled,
  })
  // The crow's foot: two prongs that meet on the line, opening to the tip.
  const FOOT = 0.55
  const foot: HeadOp = {
    kind: 'path',
    points: [at(0, -0.45), at(FOOT), at(0, 0.45)],
  }
  switch (kind) {
    case 'bar':
      return [{ kind: 'path', points: [at(0, -HALF_WIDTH), at(0, HALF_WIDTH)] }]
    case 'circle':
    case 'circle_outline':
      return [circle(0, 0.7, kind === 'circle')]
    case 'triangle':
    case 'triangle_outline':
      return [
        {
          kind: 'polygon',
          points: [to, at(0.87, -HALF_WIDTH), at(0.87, HALF_WIDTH)],
          filled: kind === 'triangle',
        },
      ]
    case 'diamond':
    case 'diamond_outline':
      return [
        {
          kind: 'polygon',
          points: [to, at(0.5, -0.4), at(1), at(0.5, 0.4)],
          filled: kind === 'diamond',
        },
      ]
    case 'cardinality_one':
      return [bar(0.25)]
    case 'cardinality_exactly_one':
      return [bar(0.25), bar(0.5)]
    case 'cardinality_many':
      return [foot]
    case 'cardinality_one_or_many':
      return [foot, bar(0.7)]
    case 'cardinality_zero_or_one':
      return [bar(0.25), circle(0.33, 0.4, false)]
    case 'cardinality_zero_or_many':
      return [foot, circle(0.6, 0.4, false)]
    // A stored document is not validated, so an unknown name can occur.
    default:
      return []
  }
}

/**
 * Both heads of `arrow`, from its absolute `points` (and whether they are
 * drawn as a curve): the end head follows the end tangent, the start head the
 * start tangent. Nothing with fewer than two points.
 */
export function arrowHeadOps(
  arrow: ArrowElement,
  points: readonly Point[],
  curved: boolean,
): HeadOp[] {
  if (points.length < 2) return []
  const ops: HeadOp[] = []
  if (arrow.endArrowhead) {
    ops.push(
      ...arrowheadOps(
        arrow.endArrowhead,
        headFrom(points, curved),
        points.at(-1)!,
      ),
    )
  }
  if (arrow.startArrowhead) {
    ops.push(
      ...arrowheadOps(
        arrow.startArrowhead,
        tailFrom(points, curved),
        points[0]!,
      ),
    )
  }
  return ops
}
