import rough from 'roughjs'
import { describe, expect, test } from 'vitest'
import { createLinear } from '../document/create.ts'
import type { Point } from '../document/types.ts'
import {
  curveBounds,
  curveSegments,
  drawnBounds,
  flattenCurve,
  headFrom,
  isCurved,
} from './curve.ts'
import { hitTest } from './hit.ts'
import { lineFromDrag } from './line.ts'

const bent = (points: Point[], type: 'line' | 'arrow' = 'line') => ({
  ...createLinear(type, lineFromDrag([0, 0], [1, 1], false)),
  x: 0,
  y: 0,
  points,
  curved: true as const,
})

describe('isCurved', () => {
  const straight = createLinear('line', lineFromDrag([0, 0], [10, 10], false))

  test('needs the flag and three points', () => {
    expect(isCurved(straight)).toBe(false)
    expect(isCurved({ ...straight, curved: true })).toBe(false)
    expect(
      isCurved(
        bent([
          [0, 0],
          [5, 9],
          [10, 0],
        ]),
      ),
    ).toBe(true)
    const unflagged = {
      ...bent([
        [0, 0],
        [5, 9],
        [10, 0],
      ]),
      curved: undefined,
    }
    expect(isCurved(unflagged)).toBe(false)
  })
})

describe('curveSegments', () => {
  test('passes through every point with Catmull-Rom control points', () => {
    const points: Point[] = [
      [0, 0],
      [60, 60],
      [120, 0],
    ]
    const [first, second] = curveSegments(points)
    // The end points are repeated, so the first segment has no previous point.
    expect(first).toEqual({
      from: [0, 0],
      c1: [10, 10],
      c2: [40, 60],
      to: [60, 60],
    })
    expect(second).toEqual({
      from: [60, 60],
      c1: [80, 60],
      c2: [110, 10],
      to: [120, 0],
    })
  })

  test('rough.js draws a curve that starts and ends on the points', () => {
    const points: Point[] = [
      [0, 0],
      [60, 80],
      [120, 10],
      [200, 90],
    ]
    const drawable = rough.generator().curve(points, {
      roughness: 0,
      disableMultiStroke: true,
      seed: 1,
    })
    const ops = drawable.sets[0]!.ops
    const [start, end] = [ops[0]!.data, ops.at(-1)!.data.slice(-2)]
    expect(Math.hypot(start[0]! - 0, start[1]! - 0)).toBeLessThan(3)
    expect(Math.hypot(end[0]! - 200, end[1]! - 90)).toBeLessThan(3)
  })
})

describe('flattenCurve', () => {
  const points: Point[] = [
    [0, 0],
    [1000, 1000],
    [2000, 0],
  ]

  test('starts and ends on the points and is finer for a smaller tolerance', () => {
    const coarse = flattenCurve(points, 5)
    const fine = flattenCurve(points, 0.05)
    expect(fine[0]).toEqual([0, 0])
    expect(fine.at(-1)).toEqual([2000, 0])
    expect(fine).toContainEqual([1000, 1000])
    expect(fine.length).toBeGreaterThan(coarse.length)
  })

  test('two points stay as they are', () => {
    expect(
      flattenCurve(
        [
          [0, 0],
          [5, 5],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [5, 5],
    ])
  })
})

describe('hit-testing a curve (ADR 0053)', () => {
  const curve = {
    ...bent([
      [0, 0],
      [1000, 1000],
      [2000, 0],
    ]),
    strokeWidth: 1,
  }

  test('hits on the curve at zoom 30, where the reach is tiny', () => {
    // Exactly on the first cubic at t = 0.9691 (the reviewer's probe).
    const [first] = curveSegments(curve.points)
    const t = 0.9691
    const u = 1 - t
    const on: Point = [0, 1].map(
      (k) =>
        u ** 3 * first!.from[k]! +
        3 * u * u * t * first!.c1[k]! +
        3 * u * t * t * first!.c2[k]! +
        t ** 3 * first!.to[k]!,
    ) as Point
    expect(hitTest(curve, on, 0.2)).toBe(true)
  })

  test('misses on the chord the curve does not follow', () => {
    expect(hitTest(curve, [500, 0], 4)).toBe(false)
    expect(hitTest({ ...curve, curved: undefined }, [1000, 1000], 4)).toBe(true)
  })

  test('a flagged two-point element is still a straight line', () => {
    const two = {
      ...bent([
        [0, 0],
        [100, 0],
      ]),
      strokeWidth: 1,
    }
    expect(hitTest(two, [50, 0], 2)).toBe(true)
    expect(hitTest(two, [50, 20], 2)).toBe(false)
  })
})

describe('curveBounds', () => {
  test('includes the overshoot beyond the points box', () => {
    const curve = bent([
      [0, 0],
      [10000, 0],
      [10000, 10000],
      [0, 10000],
    ])
    const box = curveBounds(curve)
    expect(box.x + box.width).toBeGreaterThan(10000 + 100)
    expect(drawnBounds(curve)).toEqual(box)
  })

  test('a straight element keeps its points box', () => {
    const line = createLinear('line', lineFromDrag([0, 0], [30, 40], false))
    expect(drawnBounds(line)).toMatchObject({ width: 30, height: 40 })
  })
})

describe('headFrom', () => {
  test('a polyline aims from the second to last point', () => {
    expect(
      headFrom(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        false,
      ),
    ).toEqual([10, 0])
  })

  test('a curve keeps the last chord as the head distance, along the tangent', () => {
    const points: Point[] = [
      [0, 0],
      [60, 60],
      [120, 0],
    ]
    const from = headFrom(points, true)
    const tip = points[2]!
    expect(Math.hypot(from[0] - tip[0], from[1] - tip[1])).toBeCloseTo(
      Math.hypot(60 - 120, 60 - 0),
    )
    // The tangent at the end runs from c2 = (110, 10) to the tip (120, 0).
    expect(from[0]).toBeCloseTo(60)
    expect(from[1]).toBeCloseTo(60)
  })
})

describe('Codex review round 1', () => {
  test('finding 1: a curve that overshoots along its own chord is not flattened away', () => {
    // The points are collinear, so the control points lie on the chord's line
    // but past its end: the curve swings out to about x = 1074.
    const points: Point[] = [
      [0, 0],
      [1000, 0],
      [1001, 0],
    ]
    const flat = flattenCurve(points, 0.25)
    expect(Math.max(...flat.map((p) => p[0]))).toBeGreaterThan(1070)
    const line = { ...bent(points), strokeWidth: 1 }
    expect(curveBounds(line).width).toBeGreaterThan(1070)
    expect(hitTest(line, [1074, 0], 2)).toBe(true)
  })

  test('finding 2: bounds of a curve with many points do not overflow the argument limit', () => {
    const points: Point[] = Array.from({ length: 20000 }, (_, i) => [
      i * 10,
      (i % 2) * 1000,
    ])
    expect(() => curveBounds(bent(points))).not.toThrow()
  })
})
