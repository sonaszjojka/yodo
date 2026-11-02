import { describe, expect, test } from 'vitest'
import { appendPoint, smoothPath, startStroke } from './freehand.ts'

describe('startStroke', () => {
  test('starts at the pressed point with one point and no size', () => {
    expect(startStroke([10, 20])).toEqual({
      x: 10,
      y: 20,
      width: 0,
      height: 0,
      points: [[0, 0]],
    })
  })
})

describe('appendPoint', () => {
  test('adds the point relative to the start and grows the size', () => {
    let stroke = startStroke([10, 20])
    stroke = appendPoint(stroke, [40, 10], 1)
    stroke = appendPoint(stroke, [0, 30], 1)

    expect(stroke).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      points: [
        [0, 0],
        [30, -10],
        [-10, 10],
      ],
    })
  })

  test('skips a point closer than the minimum distance to the last one', () => {
    const stroke = appendPoint(startStroke([0, 0]), [5, 0], 1)

    // Same reference: nothing changed, so the store can skip the update.
    expect(appendPoint(stroke, [5.5, 0.5], 1)).toBe(stroke)
    expect(appendPoint(stroke, [6, 0], 1).points).toHaveLength(3)
  })

  test('does not change the stroke it is given', () => {
    const stroke = startStroke([0, 0])
    appendPoint(stroke, [10, 10], 1)

    expect(stroke.points).toEqual([[0, 0]])
  })
})

describe('smoothPath', () => {
  test('is empty with no points', () => {
    expect(smoothPath([])).toEqual([])
  })

  test('a single point is a zero-length segment, so a round cap shows a dot', () => {
    expect(smoothPath([[3, 4]])).toEqual([
      { type: 'move', to: [3, 4] },
      { type: 'line', to: [3, 4] },
    ])
  })

  test('two points are a straight line', () => {
    expect(
      smoothPath([
        [0, 0],
        [10, 0],
      ]),
    ).toEqual([
      { type: 'move', to: [0, 0] },
      { type: 'line', to: [10, 0] },
    ])
  })

  test('curves through the midpoints, using each inner sample as the control', () => {
    expect(
      smoothPath([
        [0, 0],
        [10, 0],
        [10, 10],
        [20, 10],
      ]),
    ).toEqual([
      { type: 'move', to: [0, 0] },
      { type: 'quad', control: [10, 0], to: [10, 5] },
      { type: 'quad', control: [10, 10], to: [15, 10] },
      { type: 'line', to: [20, 10] },
    ])
  })
})
