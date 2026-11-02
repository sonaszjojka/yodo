import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import type { Point } from '../document/types.ts'
import {
  containsBounds,
  elementBounds,
  rectFromDrag,
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
