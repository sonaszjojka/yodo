import { describe, expect, test } from 'vitest'
import {
  clampPlace,
  defaultPlace,
  dragPlace,
  MAX_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  resizePlace,
} from './panelGeometry.ts'

const window = { width: 1200, height: 800 }

describe('defaultPlace', () => {
  test('sits at the right side under the top bar', () => {
    const place = defaultPlace(window)
    expect(place.x + place.width).toBe(window.width - 16)
    expect(place.y).toBe(76)
    expect(place.width).toBeGreaterThanOrEqual(MIN_WIDTH)
    expect(place.y + place.height).toBeLessThanOrEqual(window.height - 16)
  })
})

describe('dragPlace', () => {
  const start = { x: 600, y: 100, width: 280, height: 400 }

  test('moves by the drag', () => {
    expect(dragPlace(start, -100, 50, window)).toEqual({
      ...start,
      x: 500,
      y: 150,
    })
  })

  test('stays inside the window', () => {
    expect(dragPlace(start, 5000, 5000, window)).toEqual({
      ...start,
      x: window.width - 16 - 280,
      y: window.height - 16 - 400,
    })
    expect(dragPlace(start, -5000, -5000, window)).toMatchObject({
      x: 16,
      y: 16,
    })
  })
})

describe('resizePlace', () => {
  const start = { x: 600, y: 100, width: 280, height: 400 }

  test('the left edge changes the width and keeps the right edge', () => {
    const place = resizePlace(start, 'left', -100, 30, window)
    expect(place).toEqual({ x: 500, y: 100, width: 380, height: 400 })
  })

  test('the width stays within 240–520 px', () => {
    expect(resizePlace(start, 'left', 500, 0, window)).toMatchObject({
      width: MIN_WIDTH,
      x: 600 + 280 - MIN_WIDTH,
    })
    expect(resizePlace(start, 'left', -500, 0, window)).toMatchObject({
      width: MAX_WIDTH,
      x: 600 + 280 - MAX_WIDTH,
    })
  })

  test('the corner changes the height too, at least the minimum', () => {
    expect(resizePlace(start, 'corner', -20, 100, window)).toEqual({
      x: 580,
      y: 100,
      width: 300,
      height: 500,
    })
    expect(resizePlace(start, 'corner', 0, -1000, window).height).toBe(
      MIN_HEIGHT,
    )
  })

  test('the corner cannot grow past the bottom of the window', () => {
    const place = resizePlace(start, 'corner', 0, 5000, window)
    expect(place.y + place.height).toBe(window.height - 16)
  })
})

describe('clampPlace', () => {
  test('a stored place is pulled back into a smaller window', () => {
    const place = clampPlace(
      { x: 1000, y: 600, width: 400, height: 500 },
      { width: 800, height: 600 },
    )
    expect(place).toEqual({ x: 384, y: 84, width: 400, height: 500 })
  })

  test('a window narrower than the minimum width still fits the panel', () => {
    const place = clampPlace(
      { x: 0, y: 0, width: 300, height: 300 },
      { width: 200, height: 600 },
    )
    expect(place.width).toBe(168)
    expect(place.x).toBe(16)
  })
})
