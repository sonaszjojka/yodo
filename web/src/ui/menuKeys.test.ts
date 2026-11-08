import { describe, expect, test } from 'vitest'
import { nextMenuIndex, nextRadioIndex } from './menuKeys.ts'

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

describe('nextRadioIndex', () => {
  test.each([
    ['ArrowRight', 0, 1],
    ['ArrowRight', 2, 0],
    ['ArrowDown', 1, 2],
    ['ArrowLeft', 0, 2],
    ['ArrowUp', 2, 1],
  ])('%s from %i of 3 goes to %i', (key, from, to) => {
    expect(nextRadioIndex(key, from, 3)).toBe(to)
  })

  test('ignores other keys', () => {
    expect(nextRadioIndex('Enter', 1, 3)).toBeNull()
  })
})
