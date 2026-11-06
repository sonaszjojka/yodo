import { describe, expect, test } from 'vitest'
import { MENU_MARGIN, MENU_OFFSET, opensDown } from './menuPlacement.ts'

describe('opensDown', () => {
  test('stays upwards when the whole menu fits below the top margin', () => {
    expect(opensDown(600, 262)).toBe(false)
    // Its top lands exactly on the margin.
    expect(opensDown(MENU_MARGIN + MENU_OFFSET + 262, 262)).toBe(false)
  })

  test('flips when the top would be above the margin or the viewport', () => {
    expect(opensDown(MENU_MARGIN + MENU_OFFSET + 261, 262)).toBe(true)
    // A card whose bottom is 260px down, with the 262px menu of the review.
    expect(opensDown(260, 262)).toBe(true)
  })
})
