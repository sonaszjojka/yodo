import { describe, expect, test } from 'vitest'
import { ARROWHEADS } from '../document/types.ts'
import { arrowheadOps } from './arrowhead.ts'
import { ARROWHEAD_LENGTH, arrowhead } from './line.ts'

const from: [number, number] = [0, 0]
const to: [number, number] = [100, 0]

describe('arrowheadOps', () => {
  test('arrow is the open head of ADR 0055', () => {
    expect(arrowheadOps('arrow', from, to)).toEqual([
      { kind: 'path', points: arrowhead(from, to) },
    ])
  })

  test.each(ARROWHEADS)('%s has something to draw, behind the tip', (kind) => {
    const ops = arrowheadOps(kind, from, to)
    expect(ops.length).toBeGreaterThan(0)
    for (const op of ops) {
      const points =
        op.kind === 'circle'
          ? [op.center, [op.center[0] + op.diameter / 2, op.center[1]]]
          : op.points
      for (const [x] of points) {
        expect(x).toBeLessThanOrEqual(100.0001)
        expect(x).toBeGreaterThanOrEqual(100 - ARROWHEAD_LENGTH - 0.0001)
      }
    }
  })

  test.each(ARROWHEADS)(
    '%s draws nothing on a segment with no length',
    (kind) => {
      expect(arrowheadOps(kind, [5, 5], [5, 5])).toEqual([])
    },
  )

  test('filled and outline variants differ only in `filled`', () => {
    for (const name of ['circle', 'triangle', 'diamond'] as const) {
      const [solid] = arrowheadOps(name, from, to)
      const [outline] = arrowheadOps(`${name}_outline`, from, to)
      expect(solid).toMatchObject({ filled: true })
      expect(outline).toMatchObject({ filled: false })
      expect({ ...solid, filled: false }).toEqual(outline)
    }
  })

  test('the head turns with the line', () => {
    const [op] = arrowheadOps('triangle', [0, 0], [0, -100])
    if (op?.kind !== 'polygon') throw new Error('expected a polygon')
    expect(op.points[0]).toEqual([0, -100])
    // The base lies below the tip, and is as wide as for a horizontal line.
    expect(op.points[1]![1]).toBeGreaterThan(-100)
    expect(Math.abs(op.points[1]![0] - op.points[2]![0])).toBeCloseTo(
      ARROWHEAD_LENGTH,
      5,
    )
  })

  test('a short segment caps the head at 40% of its length', () => {
    const [op] = arrowheadOps('bar', [0, 0], [10, 0])
    if (op?.kind !== 'path') throw new Error('expected a path')
    // size 4, half width 0.5 * size
    expect(Math.abs(op.points[0]![1] - op.points[1]![1])).toBeCloseTo(4, 5)
  })

  test("crow's feet: prongs for many, plus a bar or a circle", () => {
    expect(arrowheadOps('cardinality_many', from, to)).toHaveLength(1)
    expect(arrowheadOps('cardinality_one_or_many', from, to)).toHaveLength(2)
    expect(arrowheadOps('cardinality_exactly_one', from, to)).toHaveLength(2)
    const zero = arrowheadOps('cardinality_zero_or_many', from, to)
    expect(zero.map((op) => op.kind)).toEqual(['path', 'circle'])
  })
})
