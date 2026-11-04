import { describe, expect, test } from 'vitest'
import { nextMenuIndex } from './menuKeys.ts'

describe('nextMenuIndex', () => {
  test.each([
    ['ArrowDown', 0, 1],
    ['ArrowDown', 3, 0],
    ['ArrowUp', 0, 3],
    ['ArrowUp', 2, 1],
    ['Home', 2, 0],
    ['End', 1, 3],
  ])('%s from %i of 4 goes to %i', (key, from, to) => {
    expect(nextMenuIndex(key, from, 4)).toBe(to)
  })

  test('other keys move nothing', () => {
    expect(nextMenuIndex('a', 1, 4)).toBeNull()
  })
})
