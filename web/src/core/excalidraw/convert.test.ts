import { describe, expect, test } from 'vitest'
import { estimateMeasure } from '../text/layout.ts'
import { elementBounds } from '../geometry/rect.ts'
import {
  convertExcalidraw,
  describeSummary,
  hasLosses,
  ExcalidrawImportError,
  type ConvertOptions,
} from './convert.ts'
import images from './fixtures/images.excalidraw?raw'
import shapes from './fixtures/shapes.excalidraw?raw'
import text from './fixtures/text.excalidraw?raw'
import unsupported from './fixtures/unsupported.excalidraw?raw'

const HASH = 'a'.repeat(64)

function options(overrides: Partial<ConvertOptions> = {}): ConvertOptions {
  return {
    measure: estimateMeasure,
    resolveImage: async (_id, url) =>
      url.startsWith('data:image/png') ? { fileId: HASH } : undefined,
    ...overrides,
  }
}

const convert = (raw: string, overrides?: Partial<ConvertOptions>) =>
  convertExcalidraw(JSON.parse(raw), options(overrides))

describe('shapes, lines, arrows and pencil', () => {
  test('maps each type with its style, skipping deleted elements', async () => {
    const { document, summary } = await convert(shapes)
    expect(document.elements.map((e) => e.type)).toEqual([
      'rectangle',
      'diamond',
      'ellipse',
      'pencil',
      'line',
      'arrow',
      'arrow',
    ])
    const [rect, diamond] = document.elements
    expect(rect).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      strokeColor: '#e03131',
      backgroundColor: '#ffec99',
      fillStyle: 'solid',
      strokeWidth: 4,
      strokeStyle: 'dashed',
      roughness: 2,
      opacity: 80,
      seed: 1234,
      roundness: 'round',
    })
    expect(diamond).toMatchObject({ fillStyle: 'hachure', roundness: 'sharp' })
    expect(summary.imported).toBe(7)
    expect(summary.skipped).toEqual([])
  })

  test('keeps the size of a linear element as its points box', async () => {
    const { document } = await convert(shapes)
    expect(document.elements[3]).toMatchObject({
      type: 'pencil',
      points: [
        [0, 0],
        [5, 5],
        [10, 2],
      ],
      width: 10,
      height: 5,
    })
  })

  test('reports dropped bindings and arrowheads as simplified', async () => {
    const { document, summary } = await convert(shapes)
    expect(document.elements[5]).toMatchObject({ endArrowhead: 'arrow' })
    expect(summary.simplified).toEqual([
      { reason: 'arrows no longer attached to shapes', count: 1 },
      { reason: 'arrowheads', count: 1 },
    ])
    expect(describeSummary(summary)).toEqual([
      'Simplified arrows no longer attached to shapes (1)',
      'Simplified arrowheads (1)',
    ])
  })

  test('gives every element a fresh id and keeps the order', async () => {
    const first = await convert(shapes)
    const second = await convert(shapes)
    const ids = first.document.elements.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('r1')
    expect(second.document.elements[0]!.id).not.toBe(ids[0])
    expect(first.document.id).not.toBe(second.document.id)
  })
})

describe('text', () => {
  test('puts text bound to a shape in its label', async () => {
    const { document } = await convert(text)
    const [box] = document.elements
    expect(box).toMatchObject({
      type: 'rectangle',
      label: {
        text: 'wrapped label',
        fontFamily: 'sans',
        fontSize: 28,
        textAlign: 'center',
      },
    })
    expect(
      document.elements.filter(
        (e) => e.type === 'text' && e.text.startsWith('wrapped'),
      ),
    ).toEqual([])
  })

  test('keeps free text, sized by the injected measure', async () => {
    const { document } = await convert(text)
    const free = document.elements.find(
      (e) => e.type === 'text' && e.text === 'free text',
    )
    expect(free).toMatchObject({
      fontFamily: 'mono',
      fontSize: 16,
      textAlign: 'right',
      width: 9 * 0.55 * 16,
      height: 20,
    })
  })

  test('keeps text bound to an arrow or a missing shape as plain text', async () => {
    const { document, summary } = await convert(text)
    const texts = document.elements.flatMap((e) =>
      e.type === 'text' ? [e.text] : [],
    )
    expect(texts).toEqual(
      expect.arrayContaining(['on arrow', 'orphan', 'survives']),
    )
    expect(summary.simplified).toContainEqual({
      reason: 'text on arrows or missing shapes, kept as plain text',
      count: 3,
    })
  })

  test('keeps text whose shape was deleted', async () => {
    const { document } = await convert(text)
    expect(
      document.elements.some((e) => e.type === 'text' && e.text === 'survives'),
    ).toBe(true)
  })

  test('ignores blank text', async () => {
    const { document } = await convert(text)
    expect(
      document.elements.some((e) => e.type === 'text' && e.text.trim() === ''),
    ).toBe(false)
  })
})

describe('images', () => {
  test('stores each source image once and uses the returned fileId', async () => {
    const calls: string[] = []
    const { document, summary } = await convert(images, {
      resolveImage: async (id, url) => {
        calls.push(id)
        return url.startsWith('data:image/png') ? { fileId: HASH } : undefined
      },
    })
    expect(calls.sort()).toEqual(['abc-not-a-hash', 'svgfile'])
    const imageElements = document.elements.filter((e) => e.type === 'image')
    expect(imageElements).toHaveLength(2)
    expect(imageElements[0]).toMatchObject({
      fileId: HASH,
      width: 120,
      height: 80,
    })
    expect(document.fileIds).toEqual([HASH])
    expect(summary.skipped).toEqual([
      { reason: 'images that could not be read', count: 1 },
      { reason: 'images missing from the file', count: 1 },
    ])
  })

  test('aborts when the image store fails', async () => {
    await expect(
      convert(images, {
        resolveImage: () => Promise.reject(new Error('store down')),
      }),
    ).rejects.toThrow('store down')
  })
})

describe('unsupported content', () => {
  test('skips and counts what Yodo cannot represent', async () => {
    const { document, summary } = await convert(unsupported)
    expect(document.elements).toHaveLength(1)
    expect(summary.skipped).toEqual([
      { reason: 'frames', count: 1 },
      { reason: 'embedded content', count: 1 },
      { reason: 'somethingnew elements', count: 1 },
      { reason: 'unreadable elements', count: 1 },
    ])
    expect(describeSummary(summary)[0]).toBe('Skipped frames (1)')
  })

  test('opens the view at the content, wherever it is', async () => {
    const { document } = await convert(unsupported)
    const bounds = elementBounds(document.elements[0]!)
    const { viewport } = document.appState
    expect(viewport.zoom).toBe(1)
    expect(bounds.x - viewport.x).toBe(40)
    expect(bounds.y - viewport.y).toBe(40)
  })

  test.each([
    ['null', null],
    ['an array', []],
    ['another file type', { type: 'yodo', elements: [] }],
    ['no elements', { type: 'excalidraw' }],
  ])('rejects %s', async (_name, input) => {
    await expect(convertExcalidraw(input, options())).rejects.toBeInstanceOf(
      ExcalidrawImportError,
    )
  })

  test('an empty file gives an empty drawing', async () => {
    const { document, summary } = await convertExcalidraw(
      { type: 'excalidraw', elements: [] },
      options({ name: 'Mine' }),
    )
    expect(document).toMatchObject({ name: 'Mine', elements: [], fileIds: [] })
    expect(summary.imported).toBe(0)
  })
})

describe('hasLosses', () => {
  test('is true for skipped or simplified entries, false for a clean import', async () => {
    const clean = { imported: 1, skipped: [], simplified: [] }
    expect(hasLosses(clean)).toBe(false)
    expect(
      hasLosses({ ...clean, simplified: [{ reason: 'arrowheads', count: 1 }] }),
    ).toBe(true)
    expect(
      hasLosses({ ...clean, skipped: [{ reason: 'frames', count: 1 }] }),
    ).toBe(true)
    expect(hasLosses((await convert(shapes)).summary)).toBe(true)
  })
})
