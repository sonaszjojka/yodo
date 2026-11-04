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
import { BUILT_IN_STYLE } from '../document/create.ts'
import {
  applyDefaults,
  applyStyle,
  commonStyle,
  sharedStyle,
  stylesOf,
} from './style.ts'

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
      'fillStyle',
      'strokeWidth',
      'strokeStyle',
      'roughness',
      'roundness',
      'opacity',
    ])
  })

  test('diamonds have corners; ellipses do not', () => {
    const box = { x: 0, y: 0, width: 10, height: 10 }
    expect(stylesOf(createShape('diamond', box))).toContain('roundness')
    expect(stylesOf(createShape('ellipse', box))).not.toContain('roundness')
  })

  test('lines have no fill; pencil has no fill and no look', () => {
    expect(stylesOf(line)).toEqual([
      'strokeColor',
      'strokeWidth',
      'strokeStyle',
      'roughness',
      'opacity',
    ])
    expect(stylesOf(pencil)).toEqual([
      'strokeColor',
      'strokeWidth',
      'strokeStyle',
      'opacity',
    ])
  })

  test('text takes colour, font, size, alignment and opacity', () => {
    expect(stylesOf(text('Hi'))).toEqual([
      'strokeColor',
      'fontFamily',
      'fontSize',
      'textAlign',
      'opacity',
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

describe('the panel styles (roadmap 2.2a)', () => {
  test('fill style, stroke style and opacity change a shape', () => {
    const after = applyStyle(
      doc([rect]),
      [rect.id],
      { fillStyle: 'solid', strokeStyle: 'dotted', opacity: 40 },
      estimateMeasure,
    )
    expect(after.elements[0]).toMatchObject({
      fillStyle: 'solid',
      strokeStyle: 'dotted',
      opacity: 40,
    })
  })

  test('an alignment change keeps the text box', () => {
    const before = text('Hello\nworld')
    const after = applyStyle(
      doc([before]),
      [before.id],
      { textAlign: 'center' },
      estimateMeasure,
    ).elements[0] as TextElement
    expect(after).toEqual({ ...before, textAlign: 'center' })
  })

  test('alignment does not fit a shape', () => {
    const before = doc([rect])
    expect(
      applyStyle(before, [rect.id], { textAlign: 'right' }, estimateMeasure),
    ).toBe(before)
  })
})

describe('applyDefaults', () => {
  test('sets every given style', () => {
    expect(
      applyDefaults(BUILT_IN_STYLE, { strokeWidth: 4, fontFamily: 'mono' }),
    ).toEqual({ ...BUILT_IN_STYLE, strokeWidth: 4, fontFamily: 'mono' })
  })

  test('returns the same defaults when nothing changes', () => {
    expect(applyDefaults(BUILT_IN_STYLE, { strokeWidth: 2 })).toBe(
      BUILT_IN_STYLE,
    )
    expect(applyDefaults(BUILT_IN_STYLE, {})).toBe(BUILT_IN_STYLE)
  })
})

describe('roundness (corners)', () => {
  const { roundness: _, ...old } = rect

  test('a shape without the field (an older document) reads as sharp', () => {
    expect(commonStyle([old as YodoElement]).roundness).toBe('sharp')
    expect(commonStyle([old as YodoElement, rect]).roundness).toBe('sharp')
  })

  test('setting sharp on an old shape is no change', () => {
    const document = doc([old as YodoElement])
    expect(
      applyStyle(document, [rect.id], { roundness: 'sharp' }, estimateMeasure),
    ).toBe(document)
  })

  test('round applies to rectangles only, not to a line', () => {
    const document = doc([rect, line])
    const result = applyStyle(
      document,
      [rect.id, line.id],
      { roundness: 'round' },
      estimateMeasure,
    )
    expect(result.elements[0]).toMatchObject({ roundness: 'round' })
    expect(result.elements[1]).toBe(line)
  })
})

describe('sharedStyle', () => {
  test('keeps the shared styles and drops the mixed ones', () => {
    const style = sharedStyle([
      rect,
      { ...rect, id: 'b', strokeColor: '#C2453D' },
    ])
    expect(style).not.toHaveProperty('strokeColor')
    expect(style).toMatchObject({ strokeWidth: 2, roundness: 'sharp' })
  })

  test('nothing selected shares nothing', () => {
    expect(sharedStyle([])).toEqual({})
  })
})
