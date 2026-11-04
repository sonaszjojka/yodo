// The contextual style bar's core (roadmap 2.1): which styles fit which
// elements, what a selection shares, and applying a change.
import { describe, expect, test } from 'vitest'
import {
  createDocument,
  createLinear,
  createPencil,
  createShape,
  createText,
} from '../document/create.ts'
import type { TextElement, YodoElement } from '../document/types.ts'
import { estimateMeasure, layoutText } from '../text/layout.ts'
import { applyStyle, commonStyle, stylesOf } from './style.ts'

const rect = createShape('rectangle', { x: 0, y: 0, width: 100, height: 50 })
const line = createLinear('line', {
  x: 0,
  y: 0,
  width: 50,
  height: 0,
  points: [
    [0, 0],
    [50, 0],
  ],
})
const pencil = createPencil({
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  points: [
    [0, 0],
    [10, 10],
  ],
})

function text(value: string): TextElement {
  const base = createText([10, 20])
  const { width, height } = layoutText(
    value,
    base.fontFamily,
    base.fontSize,
    estimateMeasure,
  )
  return { ...base, text: value, width, height }
}

function doc(elements: YodoElement[]) {
  return { ...createDocument(), elements }
}

describe('stylesOf', () => {
  test('shapes take every shape style, no text styles', () => {
    expect(stylesOf(rect)).toEqual([
      'strokeColor',
      'backgroundColor',
      'strokeWidth',
      'roughness',
    ])
  })

  test('lines have no fill; pencil has no fill and no look', () => {
    expect(stylesOf(line)).toEqual(['strokeColor', 'strokeWidth', 'roughness'])
    expect(stylesOf(pencil)).toEqual(['strokeColor', 'strokeWidth'])
  })

  test('text takes colour, font and size only', () => {
    expect(stylesOf(text('Hi'))).toEqual([
      'strokeColor',
      'fontFamily',
      'fontSize',
    ])
  })
})

describe('commonStyle', () => {
  test('a shared value is reported as is', () => {
    expect(commonStyle([rect, { ...rect, id: 'b' }]).strokeWidth).toBe(2)
  })

  test('different values are mixed', () => {
    const style = commonStyle([
      rect,
      { ...rect, id: 'b', strokeColor: '#C2453D' },
    ])
    expect(style.strokeColor).toBe('mixed')
  })

  test('only elements a style fits count; styles none fits are absent', () => {
    const style = commonStyle([rect, text('Hi')])
    // Text has no width: the rectangle alone decides it.
    expect(style.strokeWidth).toBe(2)
    expect(style.fontSize).toBe(20)
    expect('backgroundColor' in commonStyle([line])).toBe(false)
  })

  test('an empty selection has no styles', () => {
    expect(commonStyle([])).toEqual({})
  })
})

describe('applyStyle', () => {
  test('changes only the given elements, and only where the style fits', () => {
    const other = { ...rect, id: 'other' }
    const before = doc([rect, line, other])

    const after = applyStyle(
      before,
      [rect.id, line.id],
      { backgroundColor: '#E0E9FB' },
      estimateMeasure,
    )

    expect(after.elements[0]).toEqual({ ...rect, backgroundColor: '#E0E9FB' })
    expect(after.elements[1]).toBe(line)
    expect(after.elements[2]).toBe(other)
  })

  test('nothing to change returns the same document (no undo step)', () => {
    const before = doc([rect, line])
    expect(
      applyStyle(before, [rect.id], { strokeWidth: 2 }, estimateMeasure),
    ).toBe(before)
    expect(
      applyStyle(before, [line.id], { fontSize: 36 }, estimateMeasure),
    ).toBe(before)
    expect(applyStyle(before, [], { strokeWidth: 4 }, estimateMeasure)).toBe(
      before,
    )
  })

  test('a size or font change lays the text out again, keeping its top-left', () => {
    const small = text('Hello')
    const after = applyStyle(
      doc([small]),
      [small.id],
      { fontSize: 36 },
      estimateMeasure,
    )
    const big = after.elements[0] as TextElement
    const { width, height } = layoutText('Hello', 'hand', 36, estimateMeasure)

    expect(big).toMatchObject({ x: 10, y: 20, fontSize: 36, width, height })
    expect(big.width).toBeGreaterThan(small.width)
  })
})
