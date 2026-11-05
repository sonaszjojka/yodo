import { describe, expect, test } from 'vitest'
import {
  fittingScale,
  initialChoices,
  pngFileName,
  svgFileName,
} from './exportChoices.ts'

describe('initialChoices', () => {
  test('exports the selection when there is one, else the whole drawing', () => {
    expect(initialChoices('Sketch', 2)).toMatchObject({
      scope: 'selection',
      fileName: 'Sketch',
    })
    expect(initialChoices('Sketch', 0).scope).toBe('all')
  })

  test('opens on the PNG tab', () => {
    expect(initialChoices('Sketch', 0).format).toBe('png')
  })

  test('starts with a light background at 2x', () => {
    expect(initialChoices('Sketch', 0)).toMatchObject({
      background: true,
      dark: false,
      scale: 2,
    })
  })
})

describe('fittingScale', () => {
  const small = { x: 0, y: 0, width: 100, height: 100 }

  test('keeps the wanted scale when it fits', () => {
    expect(fittingScale(small, 3)).toBe(3)
  })

  test('drops to the largest scale that fits', () => {
    // 5000 px wide: 3x is 15000 (side ok) but the area is over the limit.
    const big = { x: 0, y: 0, width: 5000, height: 5000 }
    expect(fittingScale(big, 3)).toBe(1)
    expect(fittingScale({ x: 0, y: 0, width: 6000, height: 10 }, 3)).toBe(2)
  })

  test('is undefined when even 1x is too large', () => {
    expect(
      fittingScale({ x: 0, y: 0, width: 20000, height: 10 }, 2),
    ).toBeUndefined()
  })
})

describe('pngFileName', () => {
  test.each([
    ['Sketch', 'Sketch.png'],
    ['  My plan.png ', 'My plan.png'],
    ['a/b\\c:d', 'a-b-c-d.png'],
    ['', 'drawing.png'],
    ['...', 'drawing.png'],
    ['.hidden', 'hidden.png'],
  ])('%j becomes %j', (input, expected) => {
    expect(pngFileName(input)).toBe(expected)
  })
})

describe('svgFileName', () => {
  test.each([
    ['Sketch', 'Sketch.svg'],
    ['  My plan.SVG ', 'My plan.svg'],
    ['plan.png', 'plan.png.svg'],
    ['a/b\\c:d', 'a-b-c-d.svg'],
    ['', 'drawing.svg'],
  ])('%j becomes %j', (input, expected) => {
    expect(svgFileName(input)).toBe(expected)
  })
})
