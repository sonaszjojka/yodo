import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import type { Point } from '../document/types.ts'
import {
  containsBounds,
  cornerRadius,
  elementBounds,
  rectFromDrag,
  roundedPolygonPath,
  unionBounds,
  type Bounds,
} from './rect.ts'

describe('rectFromDrag', () => {
  test.each<[string, Point, Point]>([
    ['down-right', [10, 20], [40, 60]],
    ['up-left', [40, 60], [10, 20]],
    ['up-right', [10, 60], [40, 20]],
    ['down-left', [40, 20], [10, 60]],
  ])('normalises a %s drag', (_, start, end) => {
    expect(rectFromDrag(start, end, false)).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
  })

  test.each<[string, Point, Bounds]>([
    ['down-right', [40, 60], { x: 10, y: 20, width: 40, height: 40 }],
    ['up-left', [-20, -20], { x: -30, y: -20, width: 40, height: 40 }],
    ['up-right', [40, -20], { x: 10, y: -20, width: 40, height: 40 }],
    ['down-left', [-20, 60], { x: -30, y: 20, width: 40, height: 40 }],
  ])(
    'square: uses the longer side, growing toward the cursor (%s)',
    (_, end, expected) => {
      // The longer side here is max(|dx|, |dy|) from the start at (10, 20).
      const rect = rectFromDrag([10, 20], end, true)
      expect(rect.width).toBe(rect.height)
      expect(rect).toEqual(expected)
    },
  )

  test('a zero-size drag gives an empty rect', () => {
    expect(rectFromDrag([5, 5], [5, 5], true)).toEqual({
      x: 5,
      y: 5,
      width: 0,
      height: 0,
    })
  })
})

describe('elementBounds', () => {
  test('a shape uses its own box', () => {
    const rect = createShape('ellipse', { x: 5, y: 6, width: 30, height: 40 })
    expect(elementBounds(rect)).toEqual({ x: 5, y: 6, width: 30, height: 40 })
  })

  test('a line spans its points, which can lie left of and above (x, y)', () => {
    const line = createLinear('line', {
      x: 100,
      y: 100,
      width: 40,
      height: 30,
      points: [
        [0, 0],
        [-40, -30],
      ],
    })
    expect(elementBounds(line)).toEqual({ x: 60, y: 70, width: 40, height: 30 })
  })

  test('a line without points is a point at (x, y)', () => {
    const line = createLinear('arrow', {
      x: 7,
      y: 8,
      width: 0,
      height: 0,
      points: [],
    })
    expect(elementBounds(line)).toEqual({ x: 7, y: 8, width: 0, height: 0 })
  })
})

describe('unionBounds', () => {
  test('covers every box', () => {
    expect(
      unionBounds([
        { x: 0, y: 10, width: 10, height: 10 },
        { x: 30, y: -5, width: 5, height: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 35, height: 25 })
  })

  test('is null for no boxes', () => {
    expect(unionBounds([])).toBeNull()
  })
})

describe('containsBounds', () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 }

  test.each<[string, Bounds, boolean]>([
    ['fully inside', { x: 10, y: 10, width: 20, height: 20 }, true],
    ['touching the edges', { x: 0, y: 0, width: 100, height: 100 }, true],
    ['partly outside', { x: 90, y: 10, width: 20, height: 20 }, false],
    ['fully outside', { x: 200, y: 200, width: 5, height: 5 }, false],
  ])('%s', (_, inner, expected) => {
    expect(containsBounds(outer, inner)).toBe(expected)
  })
})

describe('cornerRadius', () => {
  test.each([
    [{ width: 40, height: 100 }, 10],
    [{ width: 100, height: 100 }, 25],
    [{ width: 400, height: 200 }, 32],
    [{ width: 0, height: 50 }, 0],
  ])('is a quarter of the shorter side, at most 32: %j', (size, radius) => {
    expect(cornerRadius({ x: 0, y: 0, ...size })).toBe(radius)
  })

  test('a negative size (a drag in progress) still gives a positive radius', () => {
    expect(cornerRadius({ x: 0, y: 0, width: -40, height: 100 })).toBe(10)
  })
})

describe('roundedPolygonPath', () => {
  const square: Point[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]

  test('cuts each corner by the radius and curves through the vertex', () => {
    expect(roundedPolygonPath(square, 10)).toBe(
      'M 10 0 L 90 0 Q 100 0 100 10 L 100 90 Q 100 100 90 100 ' +
        'L 10 100 Q 0 100 0 90 L 0 10 Q 0 0 10 0 Z',
    )
  })

  test('limits the radius to half of the shorter edge', () => {
    const thin: Point[] = [
      [0, 0],
      [100, 0],
      [100, 10],
      [0, 10],
    ]
    // Radius 5, not 30: the short edges are 10 long.
    expect(roundedPolygonPath(thin, 30)).toMatch(/^M 5 0 L 95 0 Q 100 0 100 5 /)
  })

  test('a radius of 0 gives the sharp polygon', () => {
    expect(roundedPolygonPath(square, 0)).toBe(
      'M 0 0 L 100 0 Q 100 0 100 0 L 100 100 Q 100 100 100 100 ' +
        'L 0 100 Q 0 100 0 100 L 0 0 Q 0 0 0 0 Z',
    )
  })
})
