import { describe, expect, test } from 'vitest'
import type { Point } from '../document/types.ts'
import { ARROWHEAD_LENGTH, arrowhead, lineFromDrag } from './line.ts'

describe('lineFromDrag', () => {
  test.each<[string, Point, { width: number; height: number }]>([
    ['down-right', [40, 30], { width: 30, height: 10 }],
    ['down-left', [-20, 30], { width: 30, height: 10 }],
    ['up-right', [40, 10], { width: 30, height: 10 }],
    ['up-left', [-20, 10], { width: 30, height: 10 }],
  ])('keeps the start as (x, y) when dragging %s', (_, end) => {
    const start: Point = [10, 20]
    const line = lineFromDrag(start, end, false)

    expect(line.x).toBe(10)
    expect(line.y).toBe(20)
    expect(line.points).toEqual([
      [0, 0],
      [end[0] - 10, end[1] - 20],
    ])
    expect(line.width).toBe(30)
    expect(line.height).toBe(10)
  })

  test('snaps to the nearest 15° step and keeps the length', () => {
    // 40° from horizontal snaps to 45°.
    const length = 100
    const angle = (40 * Math.PI) / 180
    const end: Point = [length * Math.cos(angle), length * Math.sin(angle)]

    const [, [dx, dy]] = lineFromDrag([0, 0], end, true).points as [
      Point,
      Point,
    ]

    expect(Math.hypot(dx, dy)).toBeCloseTo(length)
    expect(Math.atan2(dy, dx)).toBeCloseTo(Math.PI / 4)
  })

  test('a nearly flat drag snaps to exactly horizontal', () => {
    const line = lineFromDrag([0, 0], [100, 12], true) // ~7°

    expect(line.height).toBe(0)
    expect(line.points[1]![1]).toBe(0)
    expect(line.width).toBeCloseTo(Math.hypot(100, 12))
  })

  test('a nearly vertical drag snaps to exactly vertical, upward too', () => {
    const line = lineFromDrag([0, 0], [5, -80], true)

    expect(line.width).toBe(0)
    expect(line.points[1]![0]).toBe(0)
    expect(line.points[1]![1]).toBeCloseTo(-Math.hypot(5, 80))
  })

  test('a zero-length drag stays at the start', () => {
    expect(lineFromDrag([3, 4], [3, 4], true)).toEqual({
      x: 3,
      y: 4,
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [0, 0],
      ],
    })
  })
})

describe('arrowhead', () => {
  test('ends at the tip with two wings symmetric about the line', () => {
    const [left, tip, right] = arrowhead([0, 0], [100, 0])

    expect(tip).toEqual([100, 0])
    expect(left[0]).toBeCloseTo(right[0])
    expect(left[1]).toBeCloseTo(-right[1])
    // Wings point back along the line, ARROWHEAD_LENGTH from the tip.
    expect(left[0]).toBeLessThan(100)
    expect(Math.hypot(left[0] - 100, left[1])).toBeCloseTo(ARROWHEAD_LENGTH)
  })

  test('follows the line direction', () => {
    const [left, tip, right] = arrowhead([0, 0], [0, -100])

    expect(tip).toEqual([0, -100])
    // Pointing up, the wings sit below the tip.
    expect(left[1]).toBeGreaterThan(-100)
    expect(right[1]).toBeGreaterThan(-100)
  })

  test('shrinks on short lines so the head fits', () => {
    const [left, tip] = arrowhead([0, 0], [10, 0])

    expect(Math.hypot(left[0] - tip[0], left[1] - tip[1])).toBeCloseTo(4)
  })
})
