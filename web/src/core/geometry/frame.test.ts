import { describe, expect, test } from 'vitest'
import { createShape } from '../document/create.ts'
import { handleAt, selectionFrame } from './frame.ts'

// roughness 0 and strokeWidth 2 put the drawn stroke 1 unit outside the box.
const a = {
  ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 50 }),
  roughness: 0,
  strokeWidth: 2,
}
const b = { ...a, id: 'b', x: 200, y: 100 }

describe('selectionFrame', () => {
  test('is null with nothing selected', () => {
    expect(selectionFrame([], 1)).toBeNull()
  })

  test('the box is the geometry; the outline adds stroke reach and the gap', () => {
    const frame = selectionFrame([a], 1)!
    expect(frame.box).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(frame.outline).toEqual({ x: -5, y: -5, width: 110, height: 60 })
    expect(frame.elementBoxes).toEqual([
      { x: -1, y: -1, width: 102, height: 52 },
    ])
  })

  test('covers the whole group, with the gap in screen pixels', () => {
    const frame = selectionFrame([a, b], 0.5)!
    expect(frame.box).toEqual({ x: 0, y: 0, width: 300, height: 150 })
    expect(frame.outline).toEqual({ x: -3, y: -3, width: 306, height: 156 })
  })
})

describe('handleAt', () => {
  const outline = { x: 0, y: 0, width: 100, height: 60 }

  test.each([
    [[0, 0], 'nw'],
    [[100, 0], 'ne'],
    [[100, 60], 'se'],
    [[0, 60], 'sw'],
    [[105, 65], 'se'], // within half a handle plus the slop
  ] as const)('a press at %j on a corner is %s', (point, handle) => {
    expect(handleAt(outline, [...point], 1)).toBe(handle)
  })

  test.each([
    [[50, 0], 'n'],
    [[100, 30], 'e'],
    [[50, 63], 's'],
    [[-3, 30], 'w'],
  ] as const)('a press at %j on a side is %s', (point, handle) => {
    expect(handleAt(outline, [...point], 1)).toBe(handle)
  })

  test.each([[[50, 30]], [[50, 10]], [[50, -10]], [[120, 30]]] as const)(
    'a press at %j is no handle',
    (point) => {
      expect(handleAt(outline, [...point], 1)).toBeNull()
    },
  )

  test('on a small outline the middle is no handle, so the selection can be moved', () => {
    // A 12 px outline at zoom 0.25: fixed 6 px zones would cover all of it.
    const small = { x: 0, y: 0, width: 48, height: 48 }
    expect(handleAt(small, [24, 24], 4)).toBeNull()
    expect(handleAt(small, [-8, -8], 4)).toBe('nw')
    expect(handleAt(small, [24, -8], 4)).toBe('n')
  })

  test('reach is in screen pixels, so it shrinks in world units when zoomed in', () => {
    expect(handleAt(outline, [50, 3], 1)).toBe('n')
    expect(handleAt(outline, [50, 3], 0.5)).toBeNull()
  })
})
