import { describe, expect, test } from 'vitest'
import { estimateMeasure } from '../text/layout.ts'
import type { ArrowElement } from '../document/types.ts'
import { moveElements } from '../editor/selection.ts'
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

  test('maps Excalidraw arrowheads at both ends, dot to circle (ADR 0055)', async () => {
    const { document, summary } = await convert(shapes)
    expect(document.elements[5]).toMatchObject({ endArrowhead: 'arrow' })
    expect(document.elements[5]).not.toHaveProperty('startArrowhead')
    expect(document.elements[6]).toMatchObject({
      startArrowhead: 'circle',
      endArrowhead: 'bar',
    })
    expect(summary.simplified).toEqual([
      { reason: 'zigzag fills, shown as hachure', count: 1 },
    ])
  })

  test.each([
    ['crowfoot_many', 'cardinality_many'],
    ['crowfoot_one', 'cardinality_one'],
    ['crowfoot_one_or_many', 'cardinality_one_or_many'],
    ['cardinality_zero_or_many', 'cardinality_zero_or_many'],
    ['triangle_outline', 'triangle_outline'],
  ])('arrowhead %s becomes %s', async (name, head) => {
    const input = JSON.parse(shapes)
    const arrows = input.elements.filter(
      (e: { type: string }) => e.type === 'arrow',
    )
    arrows[1].endArrowhead = name
    const { document } = await convertExcalidraw(input, options())
    expect(document.elements[6]).toMatchObject({ endArrowhead: head })
  })

  test.each(['constructor', '__proto__', 'toString'])(
    'the arrowhead name %s is unknown, not an inherited property',
    async (name) => {
      const input = JSON.parse(shapes)
      const arrows = input.elements.filter(
        (e: { type: string }) => e.type === 'arrow',
      )
      arrows[1].endArrowhead = name
      const { document, summary } = await convertExcalidraw(input, options())
      expect(document.elements[6]).toMatchObject({ endArrowhead: 'arrow' })
      expect(summary.simplified).toContainEqual({
        reason: 'arrowheads',
        count: 1,
      })
    },
  )

  test('an arrowhead Yodo does not have is shown as the arrow and reported', async () => {
    const input = JSON.parse(shapes)
    const arrows = input.elements.filter(
      (e: { type: string }) => e.type === 'arrow',
    )
    arrows[1].endArrowhead = 'star'
    const { document, summary } = await convertExcalidraw(input, options())
    expect(document.elements[6]).toMatchObject({ endArrowhead: 'arrow' })
    expect(summary.simplified).toContainEqual({
      reason: 'arrowheads',
      count: 1,
    })
    expect(describeSummary(summary)).toContain('Simplified arrowheads (1)')
  })

  test('attaches a bound arrow to the converted shapes, on their outlines', async () => {
    const { document } = await convert(shapes)
    const [rectangle, , ellipse] = document.elements
    const arrow = document.elements[5] as ArrowElement
    expect(arrow.startBinding?.elementId).toBe(rectangle!.id)
    expect(arrow.endBinding?.elementId).toBe(ellipse!.id)
    // Start (0, 400) snapped onto the rectangle at (10, 20, 100x50), whose
    // corners are round: on its bottom-left curve, inside the box corner.
    expect(arrow.x).toBeGreaterThan(10)
    expect(arrow.x).toBeLessThan(40)
    expect(arrow.y).toBeGreaterThan(55)
    expect(arrow.y).toBeLessThan(70)
  })

  test('reports a binding to a shape that was not imported', async () => {
    const input = JSON.parse(shapes)
    const a1 = input.elements.find((e: { id: string }) => e.id === 'a1')
    a1.endBinding = { elementId: 'gone' }
    const { document, summary } = await convertExcalidraw(input, options())
    expect(document.elements[5]).not.toHaveProperty('endBinding')
    expect(document.elements[5]).toHaveProperty('startBinding')
    expect(summary.simplified).toContainEqual({
      reason: 'arrows no longer attached to shapes',
      count: 1,
    })
  })

  test('a binding to another arrow is not kept, since Excalidraw has none (ADR 0054)', async () => {
    const input = JSON.parse(shapes)
    const arrows = input.elements.filter(
      (e: { type: string }) => e.type === 'arrow',
    )
    arrows[0].endBinding = { elementId: arrows[1].id, focus: 0, gap: 0 }
    const { document, summary } = await convertExcalidraw(input, options())
    expect(
      document.elements.some(
        (e) => e.type === 'arrow' && 'along' in (e.endBinding ?? {}),
      ),
    ).toBe(false)
    expect(summary.simplified.map((s) => s.reason)).toContain(
      'arrows no longer attached to shapes',
    )
  })

  test('a bound arrow with a bend follows its shape when it moves', async () => {
    const input = JSON.parse(shapes)
    const a1 = input.elements.find((e: { id: string }) => e.id === 'a1')
    a1.points = [
      [0, 0],
      [40, -30],
      [100, 50],
    ]
    const { document } = await convertExcalidraw(input, options())
    const ellipse = document.elements[2]!
    const before = document.elements[5] as ArrowElement
    const moved = moveElements(document.elements, new Set([ellipse.id]), 0, 100)
    const after = moved[5] as ArrowElement
    const world = (a: ArrowElement) =>
      a.points.map(([dx, dy]) => [a.x + dx, a.y + dy])
    expect(world(after)[1]).toEqual(world(before)[1])
    expect(world(after)[0]).toEqual(world(before)[0])
    expect(world(after)[2]![1]).toBeGreaterThan(world(before)[2]![1]!)
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

  test.each(['left', 'center', 'right'])(
    'keeps the %s alignment of a shape label',
    async (textAlign) => {
      const { document } = await convertExcalidraw(
        {
          type: 'excalidraw',
          elements: [
            { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
            { id: 't', type: 'text', text: 'hi', containerId: 'r', textAlign },
          ],
        },
        options(),
      )
      expect(document.elements[0]).toMatchObject({ label: { textAlign } })
    },
  )

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

describe('visual features Yodo does not draw', () => {
  const wrap = (element: object) => ({
    type: 'excalidraw',
    elements: [
      {
        id: 'a',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        ...element,
      },
    ],
  })

  test('reports rotation, which is not drawn', async () => {
    const { document, summary } = await convertExcalidraw(
      wrap({ angle: Math.PI / 2 }),
      options(),
    )
    expect(document.elements[0]).toMatchObject({ angle: 0 })
    expect(summary.simplified).toEqual([
      { reason: 'rotated elements, shown unrotated', count: 1 },
    ])
  })

  test('reports a fill pattern Yodo does not have', async () => {
    const { summary } = await convertExcalidraw(
      wrap({ fillStyle: 'zigzag', backgroundColor: '#ffec99' }),
      options(),
    )
    expect(summary.simplified).toEqual([
      { reason: 'zigzag fills, shown as hachure', count: 1 },
    ])
  })

  test('ignores the fill pattern of an unfilled shape', async () => {
    const { summary } = await convertExcalidraw(
      wrap({ fillStyle: 'zigzag', backgroundColor: 'transparent' }),
      options(),
    )
    expect(summary.simplified).toEqual([])
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

describe('curves (ADR 0053)', () => {
  function withLine(
    type: 'line' | 'arrow',
    points: number[][],
    roundness: unknown,
  ) {
    const doc = JSON.parse(shapes)
    const template = doc.elements.find(
      (e: { type: string }) => e.type === 'line',
    )
    doc.elements = [{ ...template, type, points, roundness }]
    return convertExcalidraw(doc, options())
  }
  const bent = [
    [0, 0],
    [50, 40],
    [100, 0],
  ]

  test.each(['line', 'arrow'] as const)(
    'a round %s with a bend imports as curved',
    async (type) => {
      const { document } = await withLine(type, bent, { type: 2 })
      expect(document.elements[0]).toMatchObject({ type, curved: true })
    },
  )

  test('a sharp one, or a round one with two points, stays straight', async () => {
    const sharp = await withLine('arrow', bent, null)
    expect(sharp.document.elements[0]).not.toHaveProperty('curved')
    const straight = await withLine('arrow', bent.slice(0, 2), { type: 2 })
    expect(straight.document.elements[0]).not.toHaveProperty('curved')
  })
})
