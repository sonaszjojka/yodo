import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import { lineFromDrag } from '../geometry/line.ts'
import {
  deleteElements,
  duplicateElements,
  idsAlongPath,
  idsInBox,
  moveElements,
  resizeElements,
  topmostHit,
} from './selection.ts'

const back = createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 })
const front = {
  ...createShape('rectangle', { x: 50, y: 0, width: 100, height: 100 }),
  backgroundColor: '#E0E9FB',
}
const line = createLinear('line', lineFromDrag([300, 300], [250, 250], false))
const elements = [back, front, line]

describe('topmostHit', () => {
  test('returns the element drawn last when several are hit', () => {
    // (75, 50) is inside the filled front rectangle and away from back's outline.
    expect(topmostHit(elements, [75, 50], 2, new Set())).toBe(front.id)
    // On back's right edge, but front is filled and on top.
    expect(topmostHit(elements, [100, 50], 2, new Set())).toBe(front.id)
  })

  test('hits an unfilled shape only near its outline', () => {
    expect(topmostHit([back], [1, 50], 2, new Set())).toBe(back.id)
    expect(topmostHit([back], [30, 50], 2, new Set())).toBeNull()
  })

  test('a selected element is hit anywhere inside its box', () => {
    expect(topmostHit([back], [30, 50], 2, new Set([back.id]))).toBe(back.id)
  })

  test("a stroke hit beats a selected element's empty box", () => {
    const big = createShape('rectangle', {
      x: -50,
      y: -50,
      width: 300,
      height: 300,
    })
    // back (0..100) sits inside big, which is selected and drawn later.
    expect(topmostHit([back, big], [1, 50], 2, new Set([big.id]))).toBe(back.id)
  })

  test('returns null on empty space', () => {
    expect(topmostHit(elements, [500, 500], 2, new Set())).toBeNull()
  })
})

describe('idsInBox', () => {
  test('picks only elements fully inside the box', () => {
    const box = { x: -10, y: -10, width: 130, height: 130 }
    expect(idsInBox(elements, box)).toEqual([back.id])
  })

  test('uses a line’s points, not its (x, y)', () => {
    const box = { x: 240, y: 240, width: 70, height: 70 }
    expect(idsInBox(elements, box)).toEqual([line.id])
  })
})

describe('moveElements', () => {
  test('shifts only the given elements and keeps the rest as they were', () => {
    const moved = moveElements(elements, new Set([front.id, line.id]), 10, -5)
    expect(moved[0]).toBe(back)
    expect(moved[1]).toMatchObject({ x: 60, y: -5 })
    expect(moved[2]).toMatchObject({ x: 310, y: 295, points: line.points })
  })
})

describe('deleteElements', () => {
  test('removes the given elements and keeps the order of the rest', () => {
    expect(deleteElements(elements, new Set([front.id]))).toEqual([back, line])
  })
})

describe('resizeElements', () => {
  test('scales only the given ids and keeps the others as they were', () => {
    const resized = resizeElements(elements, new Set([back.id]), {
      anchor: [0, 0],
      sx: 2,
      sy: 0.5,
    })
    expect(resized[0]).toMatchObject({ x: 0, y: 0, width: 200, height: 50 })
    expect(resized[1]).toBe(front)
    expect(resized[2]).toBe(line)
  })
})

describe('idsAlongPath', () => {
  test('a press with no movement finds everything under the point', () => {
    // (75, 50) is inside filled front and away from back's outline.
    expect(idsAlongPath(elements, [75, 50], [75, 50], 2)).toEqual([front.id])
    // (100, 50) is on back's right edge and inside filled front.
    expect(idsAlongPath(elements, [100, 50], [100, 50], 2)).toEqual([
      back.id,
      front.id,
    ])
  })

  test('finds a thin line crossed between the two points', () => {
    // Both ends are far from the line from (250, 250) to (300, 300); only
    // the segment between them crosses it.
    expect(idsAlongPath([line], [240, 300], [300, 240], 2)).toEqual([line.id])
  })

  test('passes through the empty middle of an unfilled shape', () => {
    expect(idsAlongPath([back], [20, 40], [60, 60], 2)).toEqual([])
  })

  test('misses a square corner the eraser ring does not touch (#142)', () => {
    // Back's stroke is 2, so its reach is 3. This path passes about 3.5 from
    // its corner (100, 100), inside the square box around the corner.
    expect(idsAlongPath([back], [102.5, 110], [102.5, 102.5], 2)).toEqual([])
    expect(idsAlongPath([back], [102, 110], [102, 102], 2)).toEqual([back.id])
  })
})

describe('duplicateElements', () => {
  test('puts an offset copy with a new id right above each original', () => {
    let next = 0
    const { elements: result, ids } = duplicateElements(
      elements,
      new Set([back.id, line.id]),
      () => `copy-${++next}`,
    )

    expect(ids).toEqual(['copy-1', 'copy-2'])
    expect(result.map((element) => element.id)).toEqual([
      back.id,
      'copy-1',
      front.id,
      line.id,
      'copy-2',
    ])
    // Same seed and style, so the copy looks the same, 10 units down-right.
    expect(result[1]).toEqual({ ...back, id: 'copy-1', x: 10, y: 10 })
    expect(result[4]).toEqual({
      ...line,
      id: 'copy-2',
      x: line.x + 10,
      y: line.y + 10,
    })
    // Untouched elements keep their identity.
    expect(result[2]).toBe(front)
  })

  test('with no ids it returns the same array', () => {
    const result = duplicateElements(elements, new Set(), () => 'x')
    expect(result).toEqual({ elements, ids: [] })
    expect(result.elements).toBe(elements)
  })
})

describe('arrows attached to shapes', () => {
  const target = createShape('rectangle', { x: 0, y: 0, width: 50, height: 50 })
  const arrow = {
    ...createLinear('arrow', lineFromDrag([50, 25], [200, 25], false)),
    startBinding: { elementId: target.id, ratio: [1, 0.5] as [number, number] },
  }

  test('deleting the shape clears the arrow binding', () => {
    const [result] = deleteElements([target, arrow], new Set([target.id]))
    expect(result).not.toHaveProperty('startBinding')
  })

  test('duplicating both attaches the copy to the copied shape', () => {
    let n = 0
    const { elements } = duplicateElements(
      [target, arrow],
      new Set([target.id, arrow.id]),
      () => `copy-${++n}`,
    )
    const copy = elements.find((e) => e.type === 'arrow' && e.id !== arrow.id)
    expect(copy).toMatchObject({ startBinding: { elementId: 'copy-1' } })
    expect(elements.find((e) => e.id === arrow.id)).toBe(arrow)
  })

  test('duplicating only the arrow leaves the copy free', () => {
    const { elements } = duplicateElements(
      [target, arrow],
      new Set([arrow.id]),
      () => 'c',
    )
    expect(elements[2]).not.toHaveProperty('startBinding')
  })
})
