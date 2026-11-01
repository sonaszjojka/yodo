import { describe, expect, test } from 'vitest'
import type { Point } from '../document/types.ts'
import { rectFromDrag, type Bounds } from './rect.ts'

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
