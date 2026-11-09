import { describe, expect, test } from 'vitest'
import {
  createImage,
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
  createImage('b'.repeat(64), { width: 20, height: 10 }, box),
]

describe('arrow bindings', () => {
  const arrow = createLinear('arrow', lineFromDrag([0, 0], [10, 10], false))
  const good = { elementId: 'a', ratio: [0.5, 1] }

  test('a valid binding is kept', () => {
    const json = JSON.parse(JSON.stringify({ ...arrow, startBinding: good }))
    expect(parseElements([json])).toEqual([json])
  })

  test.each([
    ['a null ratio', { elementId: 'a', ratio: null }],
    ['a short ratio', { elementId: 'a', ratio: [1] }],
    ['a non-finite ratio', { elementId: 'a', ratio: [1, null] }],
    ['an empty id', { elementId: '', ratio: [0, 0] }],
    ['a non-object', 'a'],
  ])('%s is stripped and the arrow kept', (_name, bad) => {
    const json = JSON.parse(
      JSON.stringify({ ...arrow, startBinding: bad, endBinding: good }),
    )
    const [result] = parseElements([json])
    expect(result).toEqual({ ...arrow, endBinding: good })
    expect(result).not.toHaveProperty('startBinding')
  })
})

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
    ['an image without a fileId', { ...valid[8], fileId: undefined }],
    ['an image with a malformed fileId', { ...valid[8], fileId: '../../x' }],
    [
      'an image with an upper-case fileId',
      { ...valid[8], fileId: 'B'.repeat(64) },
    ],
    ['an image without size', { ...valid[8], width: 0 }],
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

describe('curved lines and arrows (ADR 0053)', () => {
  const bent = [
    [0, 0],
    [5, 9],
    [10, 0],
  ]

  test.each(['line', 'arrow'] as const)(
    'a %s without the field loads unchanged',
    (type) => {
      const element = createLinear(type, lineFromDrag([0, 0], [10, 10], false))
      expect(parseElements([element])).toEqual([element])
    },
  )

  test.each(['line', 'arrow'] as const)('a curved %s is kept', (type) => {
    const element = {
      ...createLinear(type, lineFromDrag([0, 0], [10, 10], false)),
      points: bent,
      curved: true,
    }
    const json = JSON.parse(JSON.stringify(element))
    expect(parseElements([json])).toEqual([json])
  })

  test.each([false, 'yes', 1, null])(
    'a bad curved value (%j) is dropped, the element kept',
    (bad) => {
      for (const type of ['line', 'arrow'] as const) {
        const element = {
          ...createLinear(type, lineFromDrag([0, 0], [10, 10], false)),
          curved: bad,
        }
        const [kept] = parseElements([JSON.parse(JSON.stringify(element))])
        expect(kept).toBeDefined()
        expect(kept).not.toHaveProperty('curved')
      }
    },
  )
})
