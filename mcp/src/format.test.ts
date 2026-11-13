import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createShape,
} from '../../web/src/core/document/create.ts'
import type {
  YodoDocument,
  YodoElement,
} from '../../web/src/core/document/types.ts'
import { drawnBounds } from '../../web/src/core/geometry/curve.ts'
import type { DrawingSummary } from '../../web/src/storage/repository.ts'
import {
  formatDrawing,
  formatRender,
  formatSearch,
  formatSummaries,
  MAX_ELEMENTS,
  MAX_TEXT,
} from './format.ts'

/** A base element with every BaseElement field, for spreading into each type. */
const base = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 }, 1)
const label = { fontFamily: 'hand', fontSize: 20, textAlign: 'center' } as const

function el(fields: Record<string, unknown>): YodoElement {
  return { ...base, ...fields } as YodoElement
}

function doc(elements: YodoElement[], name = 'Plan'): YodoDocument {
  return { ...createDocument(name), id: 'd1', elements }
}

function summary(over: Partial<DrawingSummary>): DrawingSummary {
  return {
    id: 'x',
    name: 'X',
    createdAt: 0,
    updatedAt: 0,
    revision: 1,
    ...over,
  }
}

describe('formatDrawing', () => {
  it('lists every element type with its box and details, bottom first', () => {
    const text = formatDrawing(
      doc([
        el({
          id: 'r',
          type: 'rectangle',
          x: 0.4,
          y: 0.6,
          width: 99.5,
          height: 50,
          label: { ...label, text: 'Login' },
        }),
        el({ id: 'dm', type: 'diamond', x: 200, y: 0, width: 80, height: 80 }),
        el({
          id: 'e',
          type: 'ellipse',
          x: 300,
          y: 0,
          width: 40,
          height: 20,
          angle: Math.PI / 2,
        }),
        el({
          id: 'n',
          type: 'note',
          x: 400,
          y: 0,
          width: 200,
          height: 200,
          label: { ...label, text: 'Todo' },
        }),
        el({
          id: 'i',
          type: 'image',
          x: 0,
          y: 300,
          width: 64,
          height: 32,
          fileId: 'abc123',
        }),
        el({
          id: 'l',
          type: 'line',
          x: 10,
          y: 10,
          points: [
            [0, 0],
            [-10, 20],
          ],
        }),
        el({
          id: 'a',
          type: 'arrow',
          x: 100,
          y: 25,
          points: [
            [0, 0],
            [100, 0],
          ],
          endArrowhead: 'arrow',
          startBinding: { elementId: 'r', ratio: [1, 0.5] },
          endBinding: { elementId: 'l', along: 0.333 },
        }),
        el({
          id: 'p',
          type: 'pencil',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [5, 5],
            [9, 2],
          ],
        }),
        el({
          id: 't',
          type: 'text',
          x: 0,
          y: 400,
          width: 120,
          height: 48,
          text: 'two\nlines',
          ...label,
        }),
      ]),
      7,
    )
    expect(text).toBe(
      [
        'Drawing "Plan" (id d1, rev 7)',
        '9 elements; bounds 0,0 600x448',
        'Elements, bottom first (id type x,y widthxheight details):',
        'r rectangle 0,1 100x50 label "Login"',
        'dm diamond 200,0 80x80',
        'e ellipse 300,0 40x20 rotated 90deg',
        'n note 400,0 200x200 label "Todo"',
        'i image 0,300 64x32 file abc123',
        'l line 0,10 10x20 2 points',
        'a arrow 100,25 100x0 start->r end->l@along 0.33 heads none/arrow 2 points',
        'p pencil 0,0 9x5 3 points',
        't text 0,400 120x48 "two\\nlines"',
      ].join('\n'),
    )
  })

  it('measures a curved arrow by what is drawn, overshoot included', () => {
    const curve = el({
      id: 'c',
      type: 'arrow',
      x: 0,
      y: 0,
      curved: true,
      endArrowhead: null,
      points: [
        [0, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ],
    })
    const drawn = drawnBounds(curve)
    // The control points span 0..10000; the Catmull-Rom curve swings past them.
    expect(drawn.x + drawn.width).toBeGreaterThan(11000)
    expect(drawn.y).toBeLessThan(-500)
    const r = Math.round
    const expected = `${r(drawn.x)},${r(drawn.y)} ${r(drawn.width)}x${r(drawn.height)}`
    const text = formatDrawing(doc([curve]), 1)
    expect(text).toContain(`bounds ${expected}`)
    expect(text).toContain(
      `c arrow ${expected} heads none/none 4 points curved`,
    )
  })

  it('says an empty drawing is empty', () => {
    expect(formatDrawing(doc([]), 1)).toBe(
      'Drawing "Plan" (id d1, rev 1)\n0 elements; bounds empty',
    )
  })

  it('cuts long text and escapes quotes in names', () => {
    const long = 'x'.repeat(MAX_TEXT + 5)
    const text = formatDrawing(
      doc([el({ id: 't', type: 'text', text: long, ...label })], 'Say "hi"'),
      1,
    )
    expect(text).toContain('Drawing "Say \\"hi\\""')
    expect(text).toContain(`"${'x'.repeat(MAX_TEXT)}…"`)
  })

  it(`lists at most ${MAX_ELEMENTS} elements and says how to get the rest`, () => {
    const many = Array.from({ length: MAX_ELEMENTS + 3 }, (_, i) =>
      el({ id: `r${i}` }),
    )
    const lines = formatDrawing(doc(many), 1).split('\n')
    expect(lines[1]).toBe(`${MAX_ELEMENTS + 3} elements; bounds 0,0 10x10`)
    expect(lines[2]).toBe(
      `Elements 0-${MAX_ELEMENTS - 1} of ${MAX_ELEMENTS + 3}, bottom first (id type x,y widthxheight details):`,
    )
    expect(lines).toHaveLength(3 + MAX_ELEMENTS + 1)
    expect(lines.at(-2)).toBe(`r${MAX_ELEMENTS - 1} rectangle 0,0 10x10`)
    expect(lines.at(-1)).toBe(
      `… 3 more elements: call get_drawing with offset ${MAX_ELEMENTS} for the next ones.`,
    )
  })

  it('lists the elements from an offset, the rest of the header unchanged', () => {
    const many = Array.from({ length: MAX_ELEMENTS + 3 }, (_, i) =>
      el({ id: `r${i}` }),
    )
    const lines = formatDrawing(doc(many), 1, MAX_ELEMENTS).split('\n')
    expect(lines[1]).toBe(`${MAX_ELEMENTS + 3} elements; bounds 0,0 10x10`)
    expect(lines.slice(2)).toEqual([
      `Elements ${MAX_ELEMENTS}-${MAX_ELEMENTS + 2} of ${MAX_ELEMENTS + 3}, bottom first (id type x,y widthxheight details):`,
      `r${MAX_ELEMENTS} rectangle 0,0 10x10`,
      `r${MAX_ELEMENTS + 1} rectangle 0,0 10x10`,
      `r${MAX_ELEMENTS + 2} rectangle 0,0 10x10`,
    ])
  })
})

describe('formatSummaries', () => {
  it('lists drawings newest first with id, name, time and revision', () => {
    const text = formatSummaries([
      summary({
        id: 'old',
        name: 'Old',
        updatedAt: Date.UTC(2026, 0, 1),
        revision: 2,
      }),
      summary({
        id: 'new',
        name: 'New',
        updatedAt: Date.UTC(2026, 10, 9, 12),
        revision: 5,
      }),
    ])
    expect(text).toBe(
      [
        '2 drawings, newest first (id, name, last saved, revision):',
        'new  "New"  updated 2026-11-09T12:00:00.000Z  rev 5',
        'old  "Old"  updated 2026-01-01T00:00:00.000Z  rev 2',
      ].join('\n'),
    )
  })

  it('says when there are none', () => {
    expect(formatSummaries([])).toBe('No drawings yet.')
  })
})

describe('formatSearch', () => {
  it('lists name hits and canvas-text hits with their context', () => {
    const a = summary({ id: 'a', name: 'Login flow' })
    const b = summary({ id: 'b', name: 'Sketch' })
    const text = formatSearch(
      {
        names: [a],
        text: [
          {
            summary: b,
            snippet: { before: '…the ', match: 'login', after: ' page' },
          },
        ],
      },
      'login',
    )
    expect(text).toBe(
      [
        'In names:',
        'a  "Login flow"',
        '',
        'In text on the canvas:',
        'b  "Sketch"  "…the [login] page"',
      ].join('\n'),
    )
  })

  it('says when nothing matches', () => {
    expect(formatSearch({ names: [], text: [] }, 'zzz')).toBe(
      'No drawings match "zzz".',
    )
  })
})

describe('formatRender', () => {
  const doc = { ...createDocument('Plan'), id: 'd1' }
  const box = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 }, 1)

  it('maps PNG pixels to drawing coordinates', () => {
    expect(
      formatRender({
        doc,
        revision: 3,
        format: 'png',
        theme: 'light',
        elements: [box],
        frame: { x: -16, y: 20, width: 300, height: 150 },
        scale: 2,
      }),
    ).toBe(
      [
        'Rendered "Plan" (id d1, rev 3) as PNG, light: 1 elements',
        'frame -16,20 300x150 in drawing units',
        'scale 2: 600x300 px; pixel (px,py) is drawing point (-16 + px/2, 20 + py/2)',
      ].join('\n'),
    )
  })

  it('keeps the mapping exact for a tiny scale and a fractional origin', () => {
    // A 5,000,000-unit region fits 2048 px at scale 0.0004096; rounding it to
    // 3 decimals printed "px/0". The origin keeps its fraction too.
    const frame = { x: 10.25, y: -3.5, width: 5_000_000, height: 1000 }
    const scale = 2048 / frame.width
    const line = formatRender({
      doc,
      revision: 1,
      format: 'png',
      theme: 'light',
      elements: [box],
      frame,
      scale,
    }).split('\n')[2]!
    expect(line).toBe(
      'scale 0.0004096: 2048x1 px; pixel (px,py) is drawing point (10.25 + px/0.0004096, -3.5 + py/0.0004096)',
    )
    // The printed formula lands the right edge on the frame's right edge.
    const [, x, divisor] = /\((\S+) \+ px\/(\S+),/.exec(line)!
    expect(Number(x) + 2048 / Number(divisor)).toBeCloseTo(
      frame.x + frame.width,
      0,
    )
  })

  it('keeps a large origin exact to a hundredth of a unit', () => {
    // Six significant digits printed 1234567 as 1234570: 6 px off at scale 2.
    const frame = { x: 1234567.123, y: -9876543.456, width: 100, height: 100 }
    const line = formatRender({
      doc,
      revision: 1,
      format: 'png',
      theme: 'light',
      elements: [box],
      frame,
      scale: 2,
    }).split('\n')[2]!
    expect(line).toBe(
      'scale 2: 200x200 px; pixel (px,py) is drawing point (1234567.12 + px/2, -9876543.46 + py/2)',
    )
  })

  it('has no scale line for an SVG, and names image placeholders', () => {
    const text = formatRender({
      doc,
      revision: 1,
      format: 'svg',
      theme: 'dark',
      elements: [box],
      frame: { x: 0, y: 0, width: 50, height: 50 },
      images: {
        count: 3,
        placeholders: [
          {
            elementId: 'el-a',
            fileId: '3f2a1b0c'.padEnd(64, '9'),
            reason: 'missing',
          },
          { elementId: 'el-b', fileId: 'f2', reason: 'undecodable' },
        ],
      },
    })
    expect(text).not.toContain('scale')
    expect(text.split('\n').at(-1)).toBe(
      '2 of 3 images are drawn as grey placeholders: el-a (missing, file 3f2a1b0c), el-b (undecodable, file f2).',
    )
  })

  it('has no image line when every image is drawn, or there is none', () => {
    const base = {
      doc,
      revision: 1,
      format: 'png' as const,
      theme: 'light' as const,
      elements: [box],
      frame: { x: 0, y: 0, width: 50, height: 50 },
    }
    expect(formatRender(base)).not.toContain('image')
    expect(
      formatRender({ ...base, images: { count: 4, placeholders: [] } }),
    ).not.toContain('placeholder')
  })

  it('lists at most 10 placeholders', () => {
    const placeholders = Array.from({ length: 13 }, (_, i) => ({
      elementId: `e${i}`,
      fileId: `f${i}`,
      reason: 'missing' as const,
    }))
    const line = formatRender({
      doc,
      revision: 1,
      format: 'png',
      theme: 'light',
      elements: [box],
      frame: { x: 0, y: 0, width: 50, height: 50 },
      images: { count: 13, placeholders },
    })
      .split('\n')
      .at(-1)!
    expect(line).toMatch(/^13 of 13 images are drawn as grey placeholders: e0 /)
    expect(line).toContain('e9 (missing, file f9)')
    expect(line).not.toContain('e10 ')
    expect(line).toMatch(/, and 3 more\.$/)
  })
})
