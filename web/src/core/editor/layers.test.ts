import { describe, expect, test } from 'vitest'
import { createShape } from '../document/create.ts'
import type { YodoElement } from '../document/types.ts'
import { arrange } from './layers.ts'

/** Elements a…e, drawn in that order (e on top). */
const elements: YodoElement[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  ...createShape('rectangle', { x: 0, y: 0, width: 1, height: 1 }, 1),
  id,
}))

function order(ids: string[], to: Parameters<typeof arrange>[2]) {
  return arrange(elements, new Set(ids), to).map((element) => element.id)
}

describe('arrange', () => {
  test.each([
    ['front', ['a', 'c', 'd', 'e', 'b']],
    ['back', ['b', 'a', 'c', 'd', 'e']],
    ['forward', ['a', 'c', 'b', 'd', 'e']],
    ['backward', ['b', 'a', 'c', 'd', 'e']],
  ] as const)('moves one element %s', (to, expected) => {
    expect(order(['b'], to)).toEqual(expected)
  })

  test.each([
    ['front', ['a', 'c', 'e', 'b', 'd']],
    ['back', ['b', 'd', 'a', 'c', 'e']],
    // Each selected element steps over its nearest unselected neighbour.
    ['forward', ['a', 'c', 'b', 'e', 'd']],
    ['backward', ['b', 'a', 'd', 'c', 'e']],
  ] as const)(
    'moves a split selection %s, keeping its order',
    (to, expected) => {
      expect(order(['d', 'b'], to)).toEqual(expected)
    },
  )

  test('a block at the top stays put going forward; the rest moves', () => {
    expect(order(['e', 'd', 'b'], 'forward')).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  test.each([
    [['e'], 'front'],
    [['d', 'e'], 'forward'],
    [['a'], 'back'],
    [['a', 'b'], 'backward'],
    [[], 'front'],
  ] as const)('%j %s changes nothing and returns the same array', (ids, to) => {
    expect(arrange(elements, new Set(ids), to)).toBe(elements)
  })
})
