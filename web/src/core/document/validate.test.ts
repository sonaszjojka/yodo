import { describe, expect, test } from 'vitest'
import {
  createLinear,
  createNote,
  createPencil,
  createShape,
  createText,
} from './create.ts'
import { MAX_PASTE_ELEMENTS, parseElements } from './validate.ts'
import { lineFromDrag } from '../geometry/line.ts'

const box = { x: 1, y: 2, width: 30, height: 40 }
const one = createShape('rectangle', box)
const labelled = {
  ...createShape('ellipse', box),
  label: { text: 'hi', fontFamily: 'sans', fontSize: 20, textAlign: 'left' },
}
const valid = [
  one,
  createShape('diamond', box),
  labelled,
  createNote({ x: 0, y: 0, width: 200, height: 200 }),
  createLinear('line', lineFromDrag([0, 0], [10, 10], false)),
  createLinear('arrow', lineFromDrag([0, 0], [10, 10], false)),
  createPencil(lineFromDrag([0, 0], [10, 10], false)),
  createText([5, 5]),
]

describe('parseElements', () => {
  test('keeps a valid element of every type, unchanged', () => {
    const json = JSON.parse(JSON.stringify(valid))
    expect(parseElements(json)).toEqual(json)
  })

  test('a non-array gives nothing', () => {
    expect(parseElements({})).toEqual([])
    expect(parseElements('x')).toEqual([])
    expect(parseElements(null)).toEqual([])
  })

  test.each([
    ['an unknown type', { ...one, type: 'star' }],
    ['a missing id', { ...one, id: undefined }],
    ['a non-finite number', { ...one, width: null }],
    ['a string for a number', { ...one, x: '1' }],
    ['a bad fill style', { ...one, fillStyle: 'dots' }],
    ['a bad stroke style', { ...one, strokeStyle: 'wavy' }],
    ['a non-string colour', { ...one, strokeColor: 5 }],
    ['a bad roundness', { ...one, roundness: 'pointy' }],
    ['a bad label', { ...labelled, label: { text: 1 } }],
    [
      'a label with a bad font',
      { ...labelled, label: { ...labelled.label, fontFamily: 'serif' } },
    ],
    ['a line without points', { ...valid[4], points: undefined }],
    ['a point with NaN', { ...valid[4], points: [[0, null]] }],
    ['a point that is not a pair', { ...valid[6], points: [[0, 1, 2]] }],
    ['an arrow with a bad arrowhead', { ...valid[5], endArrowhead: 'dot' }],
    ['a text without text', { ...valid[7], text: undefined }],
    ['a box with a stray points field', { ...one, points: null }],
    ['a text with a stray points field', { ...valid[7], points: [] }],
    ['a non-object', 5],
  ])('drops %s', (_name, bad) => {
    const good = JSON.parse(JSON.stringify(one))
    expect(parseElements([bad, good])).toEqual([good])
  })

  test('rejects a payload with too many elements', () => {
    const many = Array.from({ length: MAX_PASTE_ELEMENTS + 1 }, () => one)
    expect(parseElements(many)).toEqual([])
  })

  test('drops duplicate ids, keeping the first', () => {
    expect(parseElements([one, { ...one, x: 99 }])).toHaveLength(1)
  })
})
