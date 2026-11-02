import { describe, expect, test } from 'vitest'
import { createShape } from '../document/create.ts'
import {
  estimateMeasure,
  fontOf,
  LINE_HEIGHT,
  labelBox,
  layoutText,
  LABEL_PADDING,
  type Measure,
} from './layout.ts'

/** Every character is 10 px wide at any font, so widths are easy to read. */
const measure: Measure = (text) => text.length * 10

describe('fontOf', () => {
  test('puts the size before the family stack', () => {
    expect(fontOf('hand', 20)).toBe('20px "Caveat Variable", cursive')
  })
})

describe('layoutText', () => {
  test('one line is as wide as its text and one line high', () => {
    expect(layoutText('hello', 'hand', 20, measure)).toEqual({
      lines: ['hello'],
      width: 50,
      height: 20 * LINE_HEIGHT,
    })
  })

  test('newlines split lines and the widest line sets the width', () => {
    const layout = layoutText('ab\nabcd\n', 'hand', 20, measure)
    expect(layout.lines).toEqual(['ab', 'abcd', ''])
    expect(layout.width).toBe(40)
    expect(layout.height).toBe(3 * 20 * LINE_HEIGHT)
  })

  test('wraps at spaces to fit the max width', () => {
    const layout = layoutText('aa bb cc', 'hand', 20, measure, 50)
    expect(layout.lines).toEqual(['aa bb', 'cc'])
    expect(layout.width).toBe(50)
  })

  test('breaks a word longer than the max width by characters', () => {
    expect(layoutText('abcdefg', 'hand', 20, measure, 30).lines).toEqual([
      'abc',
      'def',
      'g',
    ])
  })

  test('a max width below one character still makes progress', () => {
    expect(layoutText('ab', 'hand', 20, measure, 5).lines).toEqual(['a', 'b'])
  })

  test('the estimate grows with length and size', () => {
    const font = fontOf('hand', 20)
    expect(estimateMeasure('abcd', font)).toBeGreaterThan(
      estimateMeasure('ab', font),
    )
    expect(estimateMeasure('ab', fontOf('hand', 40))).toBe(
      2 * estimateMeasure('ab', font),
    )
  })
})

describe('labelBox', () => {
  const bounds = { x: 0, y: 0, width: 200, height: 100 }

  test('a rectangle uses its box less the padding', () => {
    expect(labelBox(createShape('rectangle', bounds, 1))).toEqual({
      x: LABEL_PADDING,
      y: LABEL_PADDING,
      width: 200 - 2 * LABEL_PADDING,
      height: 100 - 2 * LABEL_PADDING,
    })
  })

  test('an ellipse uses its inscribed rectangle, centred', () => {
    const box = labelBox(createShape('ellipse', bounds, 1))
    expect(box.width).toBeCloseTo(200 / Math.SQRT2 - 2 * LABEL_PADDING)
    expect(box.x + box.width / 2).toBeCloseTo(100)
    expect(box.y + box.height / 2).toBeCloseTo(50)
  })

  test('a diamond uses half its size, centred', () => {
    const box = labelBox(createShape('diamond', bounds, 1))
    expect(box.width).toBeCloseTo(100 - 2 * LABEL_PADDING)
    expect(box.height).toBeCloseTo(50 - 2 * LABEL_PADDING)
    expect(box.x).toBeCloseTo(50 + LABEL_PADDING)
  })

  test('never has a negative size', () => {
    const box = labelBox(
      createShape('rectangle', { x: 0, y: 0, width: 4, height: 4 }, 1),
    )
    expect(box.width).toBe(0)
    expect(box.height).toBe(0)
  })

  test('widens to a minimum width around the centre', () => {
    const box = labelBox(
      createShape('rectangle', { x: 0, y: 0, width: 20, height: 20 }, 1),
      80,
    )
    expect(box).toMatchObject({ x: -30, width: 80 })
  })
})
