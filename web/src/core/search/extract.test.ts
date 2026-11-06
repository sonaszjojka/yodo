import { describe, expect, test } from 'vitest'
import {
  createDocument,
  createImage,
  createLinear,
  createNote,
  createShape,
  createText,
} from '../document/create.ts'
import type { YodoDocument, YodoElement } from '../document/types.ts'
import { extractSearchText } from './extract.ts'

function docWith(...elements: YodoElement[]): YodoDocument {
  return { ...createDocument('Plan'), elements }
}

function text(value: string) {
  return { ...createText([0, 0]), text: value }
}

function labelled(
  type: 'rectangle' | 'diamond' | 'ellipse' | 'note',
  value: string,
): YodoElement {
  const bounds = { x: 0, y: 0, width: 10, height: 10 }
  const shape = type === 'note' ? createNote(bounds) : createShape(type, bounds)
  return {
    ...shape,
    label: {
      text: value,
      fontFamily: 'hand',
      fontSize: 20,
      textAlign: 'center',
    },
  } as YodoElement
}

describe('extractSearchText', () => {
  test('is empty for an empty drawing', () => {
    expect(extractSearchText(createDocument())).toBe('')
  })

  test('joins free text and shape labels in element order', () => {
    const doc = docWith(
      text('first'),
      labelled('rectangle', 'second'),
      labelled('note', 'third'),
      labelled('diamond', 'fourth'),
      labelled('ellipse', 'fifth'),
    )
    expect(extractSearchText(doc)).toBe('first\nsecond\nthird\nfourth\nfifth')
  })

  test('skips elements without text and blank texts', () => {
    const doc = docWith(
      text('  \n '),
      createShape('rectangle', { x: 0, y: 0, width: 5, height: 5 }),
      createLinear('line', {
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        points: [
          [0, 0],
          [5, 5],
        ],
      }),
      createImage(
        'a'.repeat(64),
        { width: 10, height: 10 },
        {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ),
      text('kept'),
    )
    expect(extractSearchText(doc)).toBe('kept')
  })

  test('does not include the drawing name', () => {
    expect(extractSearchText(docWith(text('body')))).toBe('body')
  })

  test('replaces lone surrogates so the text can always be encoded', () => {
    const out = extractSearchText(docWith(text('a\uD800b'), text('😀')))
    expect(out).toBe('a�b\n😀')
    expect(() => encodeURIComponent(out)).not.toThrow()
  })
})
