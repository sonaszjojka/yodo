import { describe, expect, test } from 'vitest'
import { createImage, createShape } from '../core/document/create.ts'
import {
  EXPORT_TABS,
  fittingScale,
  initialChoices,
  neighbourFormat,
  picturesLoading,
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

  test('opens on the Yodo file tab when the drawing is empty', () => {
    expect(initialChoices('Sketch', 0, true).format).toBe('yodo')
    expect(initialChoices('Sketch', 0, false).format).toBe('png')
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

describe('tabs', () => {
  test('are PNG, SVG and Yodo file, in that order', () => {
    expect(EXPORT_TABS.map((tab) => tab.label)).toEqual([
      'PNG',
      'SVG',
      'Yodo file',
    ])
  })

  test('arrow keys move to the neighbour and wrap around', () => {
    expect(neighbourFormat('png', 'ArrowRight')).toBe('svg')
    expect(neighbourFormat('svg', 'ArrowRight')).toBe('yodo')
    expect(neighbourFormat('yodo', 'ArrowRight')).toBe('png')
    expect(neighbourFormat('png', 'ArrowLeft')).toBe('yodo')
    expect(neighbourFormat('yodo', 'ArrowLeft')).toBe('svg')
  })
})

describe('picturesLoading', () => {
  const view = { x: 0, y: 0, width: 1000, height: 1000 }
  const box = { x: 0, y: 0, width: 10, height: 10 }
  const a = createImage('a'.repeat(64), { width: 10, height: 10 }, view)
  const b = createImage('b'.repeat(64), { width: 10, height: 10 }, view)
  const rect = createShape('rectangle', box)

  test('is true while any exported image is still loading', () => {
    const loading = (fileId: string) => fileId === b.fileId
    expect(picturesLoading([rect, a, b], loading)).toBe(true)
    expect(picturesLoading([rect, a], loading)).toBe(false)
  })

  test('is false without images, whatever is loading', () => {
    expect(picturesLoading([rect], () => true)).toBe(false)
  })
})
