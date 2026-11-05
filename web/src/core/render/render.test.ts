import { describe, expect, test, vi } from 'vitest'
import {
  DEFAULT_LABEL,
  createLinear,
  createPencil,
  createImage,
  createNote,
  createShape,
  createText,
} from '../document/create.ts'
import { appendPoint, startStroke } from '../geometry/freehand.ts'
import { arrowhead, lineFromDrag } from '../geometry/line.ts'
import { fontOf } from '../text/layout.ts'
import {
  canvasSize,
  renderScene,
  type SceneContext,
  type SceneRough,
} from './render.ts'

describe('canvasSize', () => {
  test.each([
    [1, { width: 800, height: 600 }],
    [2, { width: 1600, height: 1200 }],
    [1.5, { width: 1200, height: 900 }],
  ])('scales the backing store by the pixel ratio %s', (dpr, expected) => {
    expect(canvasSize(800, 600, dpr)).toEqual(expected)
  })

  test('rounds fractional sizes to whole pixels', () => {
    expect(canvasSize(333, 101, 1.25)).toEqual({ width: 416, height: 126 })
  })
})

const IDENTITY = { x: 0, y: 0, zoom: 1 }

function fakeContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    beginPath: vi.fn(),
    rect: vi.fn(),
    drawImage: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    // Every badge text measures 40 px wide.
    measureText: vi.fn((_text: string) => ({ width: 40 }) as TextMetrics),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    setLineDash: vi.fn(),
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetY: 0,
  } satisfies SceneContext
}

function fakeRough() {
  return {
    rectangle: vi.fn(),
    polygon: vi.fn(),
    ellipse: vi.fn(),
    linearPath: vi.fn(),
    path: vi.fn(),
  } satisfies SceneRough
}

const SURFACE = { width: 800, height: 600, dpr: 1 }

describe('renderScene', () => {
  test('scales by the pixel ratio and clears the visible area', () => {
    const ctx = fakeContext()
    const rough = fakeRough()

    renderScene(ctx, rough, [], { width: 800, height: 600, dpr: 2 }, IDENTITY)

    expect(ctx.setTransform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)
    expect(rough.rectangle).not.toHaveBeenCalled()
  })

  test('maps world to device pixels through the viewport', () => {
    const ctx = fakeContext()
    const rough = fakeRough()

    renderScene(
      ctx,
      rough,
      [],
      { width: 800, height: 600, dpr: 2 },
      { x: 10, y: -5, zoom: 3 },
    )

    // Clear first at CSS scale, then scale = dpr * zoom = 6 and the world
    // point (10, -5) lands on the top-left corner.
    expect(ctx.setTransform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0)
    expect(ctx.setTransform).toHaveBeenLastCalledWith(6, 0, 0, 6, -60, 30)
  })

  test('draws each rectangle with its own seed and style', () => {
    const ctx = fakeContext()
    const rough = fakeRough()
    const rect = createShape(
      'rectangle',
      { x: 1, y: 2, width: 3, height: 4 },
      42,
    )

    renderScene(
      ctx,
      rough,
      [rect],
      { width: 800, height: 600, dpr: 1 },
      IDENTITY,
    )

    expect(rough.rectangle).toHaveBeenCalledWith(1, 2, 3, 4, {
      seed: 42,
      stroke: '#1E1F22',
      strokeWidth: 2,
      roughness: 1,
      fill: undefined,
      fillStyle: 'hachure',
      strokeLineDash: undefined,
    })
  })

  test('applies opacity and dashes', () => {
    const ctx = fakeContext()
    let alphaWhileDrawing = 1
    const rough = {
      ...fakeRough(),
      rectangle: vi.fn(() => {
        alphaWhileDrawing = ctx.globalAlpha
      }),
    }
    const rect = {
      ...createShape('rectangle', { x: 0, y: 0, width: 5, height: 5 }, 7),
      opacity: 50,
      strokeStyle: 'dashed' as const,
      backgroundColor: '#F7E1DE',
    }

    renderScene(ctx, rough, [rect], { width: 10, height: 10, dpr: 1 }, IDENTITY)

    expect(alphaWhileDrawing).toBe(0.5)
    expect(ctx.restore).toHaveBeenCalled()
    expect(rough.rectangle).toHaveBeenCalledWith(
      0,
      0,
      5,
      5,
      expect.objectContaining({
        fill: '#F7E1DE',
        strokeLineDash: [8, 8],
      }),
    )
  })

  test('draws a diamond through the midpoints of its box', () => {
    const rough = fakeRough()
    const diamond = createShape(
      'diamond',
      { x: 0, y: 0, width: 100, height: 60 },
      3,
    )

    renderScene(fakeContext(), rough, [diamond], SURFACE, IDENTITY)

    expect(rough.polygon).toHaveBeenCalledWith(
      [
        [50, 0],
        [100, 30],
        [50, 60],
        [0, 30],
      ],
      expect.objectContaining({ seed: 3 }),
    )
  })

  test.each(['rectangle', 'diamond'] as const)(
    'draws a round %s as a rounded path with its seed',
    (type) => {
      const rough = fakeRough()
      const shape = {
        ...createShape(type, { x: 0, y: 0, width: 100, height: 60 }, 5),
        roundness: 'round' as const,
      }

      renderScene(fakeContext(), rough, [shape], SURFACE, IDENTITY)

      expect(rough.rectangle).not.toHaveBeenCalled()
      expect(rough.polygon).not.toHaveBeenCalled()
      // Radius: a quarter of the shorter side (60 / 4 = 15).
      const start = type === 'rectangle' ? 'M 15 0 ' : 'M '
      expect(rough.path).toHaveBeenCalledWith(
        expect.stringContaining(start),
        expect.objectContaining({ seed: 5 }),
      )
    },
  )

  test('a shape without roundness (an older document) is drawn sharp', () => {
    const rough = fakeRough()
    const { roundness: _, ...old } = createShape(
      'rectangle',
      { x: 0, y: 0, width: 10, height: 10 },
      6,
    )

    renderScene(fakeContext(), rough, [old], SURFACE, IDENTITY)

    expect(rough.rectangle).toHaveBeenCalled()
    expect(rough.path).not.toHaveBeenCalled()
  })

  test('draws an ellipse from its centre and size', () => {
    const rough = fakeRough()
    const ellipse = createShape(
      'ellipse',
      { x: 10, y: 20, width: 100, height: 60 },
      4,
    )

    renderScene(fakeContext(), rough, [ellipse], SURFACE, IDENTITY)

    expect(rough.ellipse).toHaveBeenCalledWith(
      60,
      50,
      100,
      60,
      expect.objectContaining({ seed: 4 }),
    )
  })

  test('draws a line through its absolute points, with no head', () => {
    const rough = fakeRough()
    const line = createLinear('line', lineFromDrag([10, 20], [0, 50], false), 5)

    renderScene(fakeContext(), rough, [line], SURFACE, IDENTITY)

    expect(rough.linearPath).toHaveBeenCalledTimes(1)
    expect(rough.linearPath).toHaveBeenCalledWith(
      [
        [10, 20],
        [0, 50],
      ],
      expect.objectContaining({ seed: 5 }),
    )
  })

  test('draws an arrow with its head at the end, with the same seed', () => {
    const rough = fakeRough()
    const arrow = createLinear(
      'arrow',
      lineFromDrag([0, 0], [100, 0], false),
      6,
    )

    renderScene(fakeContext(), rough, [arrow], SURFACE, IDENTITY)

    expect(rough.linearPath).toHaveBeenCalledTimes(2)
    expect(rough.linearPath).toHaveBeenLastCalledWith(
      arrowhead([0, 0], [100, 0]),
      expect.objectContaining({ seed: 6 }),
    )
  })

  test('a zero-length arrow draws no head', () => {
    const rough = fakeRough()
    const arrow = createLinear('arrow', lineFromDrag([5, 5], [5, 5], false), 6)

    renderScene(fakeContext(), rough, [arrow], SURFACE, IDENTITY)

    expect(rough.linearPath).toHaveBeenCalledTimes(1)
  })

  test('an arrow without an arrowhead draws only its line', () => {
    const rough = fakeRough()
    const arrow = {
      ...createLinear('arrow', lineFromDrag([0, 0], [100, 0], false), 6),
      endArrowhead: null,
    }

    renderScene(fakeContext(), rough, [arrow], SURFACE, IDENTITY)

    expect(rough.linearPath).toHaveBeenCalledTimes(1)
  })

  // Stored documents are not validated, so a line or arrow may arrive with
  // fewer than two points; it must not stop the rest of the scene drawing.
  test.each([
    ['line', [[0, 0]]],
    ['arrow', [[0, 0]]],
    ['arrow', []],
  ] as const)(
    'a %s with %j as points draws no head and does not throw',
    (type, points) => {
      const rough = fakeRough()
      const broken = {
        ...createLinear(type, lineFromDrag([0, 0], [100, 0], false), 6),
        points: points.map(([x, y]) => [x, y] as [number, number]),
      }
      const next = createShape(
        'rectangle',
        { x: 0, y: 0, width: 10, height: 10 },
        7,
      )

      renderScene(fakeContext(), rough, [broken, next], SURFACE, IDENTITY)

      expect(rough.linearPath).toHaveBeenCalledTimes(1)
      expect(rough.rectangle).toHaveBeenCalledTimes(1)
    },
  )
})

describe('pencil strokes (ADR 0024)', () => {
  /** A stroke from (10, 20) through (20, 20) and (20, 30) to (30, 30). */
  function stroke() {
    let geometry = startStroke([10, 20])
    for (const point of [
      [20, 20],
      [20, 30],
      [30, 30],
    ] as const) {
      geometry = appendPoint(geometry, [...point], 1)
    }
    return { ...createPencil(geometry, 8), strokeColor: '#3F8F5A' }
  }

  test('draws a smoothed canvas path through the absolute points, without rough.js', () => {
    const ctx = fakeContext()
    const rough = fakeRough()
    const calls: string[] = []
    ctx.moveTo.mockImplementation((x, y) => calls.push(`M ${x} ${y}`))
    ctx.lineTo.mockImplementation((x, y) => calls.push(`L ${x} ${y}`))
    ctx.quadraticCurveTo.mockImplementation((cx, cy, x, y) =>
      calls.push(`Q ${cx} ${cy} ${x} ${y}`),
    )
    let style = {}
    ctx.stroke.mockImplementation(() => {
      style = {
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        lineCap: ctx.lineCap,
        lineJoin: ctx.lineJoin,
      }
    })

    renderScene(ctx, rough, [stroke()], SURFACE, IDENTITY)

    expect(calls).toEqual([
      'M 10 20',
      'Q 20 20 20 25',
      'Q 20 30 25 30',
      'L 30 30',
    ])
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    expect(style).toEqual({
      strokeStyle: '#3F8F5A',
      lineWidth: 2,
      lineCap: 'round',
      lineJoin: 'round',
    })
    expect(ctx.setLineDash).toHaveBeenCalledWith([])
    expect(rough.linearPath).not.toHaveBeenCalled()
  })

  test('applies the stroke style as a dash', () => {
    const ctx = fakeContext()

    renderScene(
      ctx,
      fakeRough(),
      [{ ...stroke(), strokeStyle: 'dashed' }],
      SURFACE,
      IDENTITY,
    )

    expect(ctx.setLineDash).toHaveBeenCalledWith([8, 8])
  })

  test('a stroke with no points draws nothing and does not throw', () => {
    const ctx = fakeContext()
    const next = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })
    const rough = fakeRough()

    renderScene(
      ctx,
      rough,
      [{ ...stroke(), points: [] }, next],
      SURFACE,
      IDENTITY,
    )

    expect(ctx.moveTo).not.toHaveBeenCalled()
    expect(rough.rectangle).toHaveBeenCalledTimes(1)
  })
})

describe('selection overlay', () => {
  const rect = createShape('rectangle', {
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  })

  test('draws nothing without a selection or box', () => {
    const ctx = fakeContext()
    renderScene(ctx, fakeRough(), [rect], SURFACE, IDENTITY)
    expect(ctx.rect).not.toHaveBeenCalled()
    expect(ctx.roundRect).not.toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  test('outlines the selection with a gap and puts a handle on each corner', () => {
    const ctx = fakeContext()
    renderScene(ctx, fakeRough(), [rect], SURFACE, IDENTITY, {
      selected: [rect],
      marquee: null,
    })
    // Around (10, 20, 100, 50): 3 world units for the 2-wide stroke and its
    // rough wobble (roughness 1 × offset 2), then the 4 px gap.
    expect(ctx.rect).toHaveBeenCalledExactlyOnceWith(3, 13, 114, 64)
    // Four handles and the size badge.
    expect(ctx.roundRect).toHaveBeenCalledTimes(5)
    // Handles are 8 px squares centred on the gapped corners.
    expect(ctx.roundRect).toHaveBeenCalledWith(-1, 9, 8, 8, 2)
    expect(ctx.roundRect).toHaveBeenCalledWith(113, 73, 8, 8, 2)
  })

  test('keeps the overlay the same size on screen at any zoom', () => {
    const ctx = fakeContext()
    renderScene(
      ctx,
      fakeRough(),
      [rect],
      SURFACE,
      { x: 0, y: 0, zoom: 2 },
      {
        selected: [rect],
        marquee: null,
      },
    )
    // At zoom 2, 4 px of gap is 2 world units and a handle is 4 units wide;
    // the stroke margin (3) stays in world units.
    expect(ctx.rect).toHaveBeenCalledExactlyOnceWith(5, 15, 110, 60)
    expect(ctx.roundRect).toHaveBeenCalledWith(3, 13, 4, 4, 1)
  })

  test('with several selected, outlines each plus one box with handles', () => {
    const other = createShape('ellipse', {
      x: 200,
      y: 20,
      width: 50,
      height: 50,
    })
    const ctx = fakeContext()
    renderScene(ctx, fakeRough(), [rect, other], SURFACE, IDENTITY, {
      selected: [rect, other],
      marquee: null,
    })
    // Two element outlines and the group box.
    expect(ctx.rect).toHaveBeenCalledTimes(3)
    expect(ctx.rect).toHaveBeenLastCalledWith(3, 13, 254, 64)
    // Four handles and one badge for the whole group.
    expect(ctx.roundRect).toHaveBeenCalledTimes(5)
    expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith(
      '240 × 50',
      expect.any(Number),
      expect.any(Number),
    )
  })

  test('shows the rounded size in a badge centred under the outline', () => {
    const ctx = fakeContext()
    const odd = { ...rect, width: 99.6, height: 50.2 }
    renderScene(ctx, fakeRough(), [odd], SURFACE, IDENTITY, {
      selected: [odd],
      marquee: null,
    })
    // Outline (3, 13, 113.6, 64.2): centre x 59.8, bottom 77.2; the badge
    // starts 8 px lower, is 18 px tall and 40 + 2 × 6 px wide.
    expect(ctx.roundRect).toHaveBeenLastCalledWith(33.8, 85.2, 52, 18, 9)
    expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith('100 × 50', 59.8, 94.2)
  })

  test('keeps the badge in screen pixels when zoomed and panned', () => {
    const ctx = fakeContext()
    renderScene(
      ctx,
      fakeRough(),
      [rect],
      { ...SURFACE, dpr: 2 },
      { x: 10, y: 20, zoom: 2 },
      { selected: [rect], marquee: null },
    )
    // Outline bottom-centre (60, 75) in world is ((60 - 10) × 2, (75 - 20) × 2).
    expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith('100 × 50', 100, 127)
    // Drawn with only the pixel ratio applied.
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
  })

  test('draws the selection box', () => {
    const ctx = fakeContext()
    renderScene(ctx, fakeRough(), [], SURFACE, IDENTITY, {
      selected: [],
      marquee: { x: 1, y: 2, width: 30, height: 40 },
    })
    expect(ctx.rect).toHaveBeenCalledExactlyOnceWith(1, 2, 30, 40)
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })
})

describe('text (ADR 0027)', () => {
  const text = {
    ...createText([10, 20], 1),
    text: 'a\nbb',
    width: 40,
    height: 50,
  }

  test('draws each line in its font and stroke colour, centred in its line box', () => {
    const ctx = fakeContext()
    renderScene(ctx, fakeRough(), [text], SURFACE, IDENTITY)

    expect(ctx.fillText).toHaveBeenNthCalledWith(1, 'a', 10, 20 + 12.5)
    expect(ctx.fillText).toHaveBeenNthCalledWith(2, 'bb', 10, 20 + 37.5)
    expect(ctx.font).toBe(fontOf('hand', 20))
    expect(ctx.fillStyle).toBe('#1E1F22')
    expect(ctx.textBaseline).toBe('middle')
  })

  test.each([
    ['center', 30],
    ['right', 50],
  ] as const)('aligns %s within the element width', (textAlign, x) => {
    const ctx = fakeContext()
    renderScene(ctx, fakeRough(), [{ ...text, textAlign }], SURFACE, IDENTITY)

    expect(ctx.textAlign).toBe(textAlign)
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, 'a', x, 32.5)
  })

  test('draws a shape label centred in its label box, after the shape', () => {
    const ctx = fakeContext()
    const rough = fakeRough()
    const shape = {
      ...createShape('rectangle', { x: 0, y: 0, width: 200, height: 100 }, 1),
      label: {
        text: 'Hi',
        fontFamily: 'hand',
        fontSize: 20,
        textAlign: 'center',
      } as const,
    }
    renderScene(ctx, rough, [shape], SURFACE, IDENTITY)

    expect(rough.rectangle).toHaveBeenCalledOnce()
    // Label box: 5..195 × 5..95; one 25 px line centred in it.
    expect(ctx.fillText).toHaveBeenCalledWith('Hi', 100, 50)
  })

  test('draws a note as a plain filled box with a shadow, then its label', () => {
    const ctx = fakeContext()
    const rough = fakeRough()
    const made = {
      ...createNote({ x: 0, y: 0, width: 200, height: 100 }, 1),
      label: {
        text: 'Hi',
        fontFamily: 'hand',
        fontSize: 20,
        textAlign: 'center',
      } as const,
    }
    const fills: string[] = []
    ctx.fill.mockImplementation(() => fills.push(ctx.fillStyle))

    renderScene(ctx, rough, [made], SURFACE, IDENTITY)

    // Not rough.js (ADR 0038): a Canvas rounded box filled in the note's Sand.
    expect(rough.rectangle).not.toHaveBeenCalled()
    expect(ctx.roundRect).toHaveBeenCalledWith(
      0,
      0,
      200,
      100,
      expect.any(Number),
    )
    expect(fills).toEqual(['#F9EBD6'])
    // The shadow is set for the fill and reset by restore, so text has none.
    expect(ctx.restore.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(ctx.fillText).toHaveBeenCalledWith('Hi', 100, 50)
  })

  describe('images', () => {
    const view = { x: 0, y: 0, width: 1000, height: 1000 }
    const image = {
      ...createImage('a'.repeat(64), { width: 200, height: 100 }, view),
      x: 10,
      y: 20,
      opacity: 50,
    }

    test('draws the picture into its box with its opacity', () => {
      const ctx = fakeContext()
      const picture = {} as CanvasImageSource
      const alphas: number[] = []
      ctx.drawImage.mockImplementation(() => alphas.push(ctx.globalAlpha))

      renderScene(
        ctx,
        fakeRough(),
        [image],
        {
          ...SURFACE,
          images: (id) => (id === image.fileId ? picture : undefined),
        },
        IDENTITY,
      )

      expect(ctx.drawImage).toHaveBeenCalledWith(picture, 10, 20, 200, 100)
      expect(alphas).toEqual([0.5])
    })

    test.each(['light', 'dark'] as const)(
      'draws a grey placeholder box in %s mode while the picture is missing',
      (theme) => {
        const ctx = fakeContext()
        const fills: string[] = []
        ctx.fill.mockImplementation(() => fills.push(ctx.fillStyle))

        renderScene(ctx, fakeRough(), [image], { ...SURFACE, theme }, IDENTITY)

        expect(ctx.drawImage).not.toHaveBeenCalled()
        expect(ctx.rect).toHaveBeenCalledWith(10, 20, 200, 100)
        expect(fills).toHaveLength(1)
      },
    )
  })

  test('fills a note with the dark twin of its colour in dark mode', () => {
    const ctx = fakeContext()
    const fills: string[] = []
    ctx.fill.mockImplementation(() => fills.push(ctx.fillStyle))

    renderScene(
      ctx,
      fakeRough(),
      [createNote({ x: 0, y: 0, width: 10, height: 10 }, 1)],
      { ...SURFACE, theme: 'dark' },
      IDENTITY,
    )

    expect(fills).toEqual(['#3B2F1F'])
  })

  test('wraps a label to the label box width', () => {
    const ctx = fakeContext()
    // 40 px per character; the label box is 90 wide, above the minimum.
    ctx.measureText.mockImplementation(
      (text: string) => ({ width: text.length * 40 }) as TextMetrics,
    )
    const shape = {
      ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }, 1),
      label: {
        text: 'a b',
        fontFamily: 'hand',
        fontSize: 20,
        textAlign: 'left',
      } as const,
    }
    renderScene(ctx, fakeRough(), [shape], SURFACE, IDENTITY)

    expect(ctx.fillText.mock.calls.map(([line]) => line)).toEqual(['a', 'b'])
  })
})

describe('dark theme', () => {
  const DARK = { ...SURFACE, theme: 'dark' } as const

  /** Rectangle with fill and label, ellipse, pencil stroke and free text. */
  function referenceScene() {
    const rect = {
      ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 60 }, 1),
      strokeColor: '#C2453D',
      backgroundColor: '#F7E1DE',
      label: { ...DEFAULT_LABEL, text: 'Hi' },
    }
    const ellipse = {
      ...createShape('ellipse', { x: 0, y: 0, width: 50, height: 50 }, 2),
      strokeColor: '#336699',
      backgroundColor: 'transparent',
    }
    const pencil = {
      ...createPencil(
        {
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [5, 5],
            [10, 0],
          ],
        } as never,
        3,
      ),
      strokeColor: '#3F8F5A',
    }
    const text = {
      ...createText([0, 0], 4),
      text: 'note',
      width: 40,
      height: 20,
    }
    return { rect, ellipse, pencil, text }
  }

  /** The colour the context held at each draw call of a kind. */
  function colorsAtDraw(ctx: ReturnType<typeof fakeContext>) {
    const text: string[] = []
    const stroke: string[] = []
    ctx.fillText.mockImplementation(() => void text.push(ctx.fillStyle))
    ctx.stroke.mockImplementation(() => void stroke.push(ctx.strokeStyle))
    return { text, stroke }
  }

  test('draws the reference scene with dark-adapted colours', () => {
    const { rect, ellipse, pencil, text } = referenceScene()
    const ctx = fakeContext()
    const rough = fakeRough()
    const seen = colorsAtDraw(ctx)

    renderScene(ctx, rough, [rect, ellipse, pencil, text], DARK, IDENTITY)

    // Palette colours use their twins; the custom blue goes through the algorithm.
    expect(rough.rectangle).toHaveBeenCalledWith(
      0,
      0,
      100,
      60,
      expect.objectContaining({ stroke: '#F08A80', fill: '#3D2624' }),
    )
    const ellipseOptions = rough.ellipse.mock.calls[0][4] as {
      stroke: string
      fill?: string
    }
    expect(ellipseOptions.fill).toBeUndefined()
    expect(ellipseOptions.stroke).not.toBe('#336699')
    // The label follows the shape's stroke; the free text uses its own (Ink).
    expect(seen.text).toEqual(['#F08A80', '#E4E6E8'])
    expect(seen.stroke).toContain('#6CC28A')
  })

  test('light stays as stored, with or without a theme', () => {
    const { rect } = referenceScene()
    for (const surface of [SURFACE, { ...SURFACE, theme: 'light' as const }]) {
      const rough = fakeRough()
      renderScene(fakeContext(), rough, [rect], surface, IDENTITY)
      expect(rough.rectangle).toHaveBeenCalledWith(
        0,
        0,
        100,
        60,
        expect.objectContaining({ stroke: '#C2453D', fill: '#F7E1DE' }),
      )
    }
  })

  test('draws the selection overlay in the dark tokens', () => {
    const { rect } = referenceScene()
    const ctx = fakeContext()
    const fills: string[] = []
    ctx.fill.mockImplementation(() => void fills.push(ctx.fillStyle))
    ctx.fillText.mockImplementation(() => void fills.push(ctx.fillStyle))

    renderScene(ctx, fakeRough(), [rect], DARK, IDENTITY, {
      selected: [rect],
      marquee: { x: 0, y: 0, width: 5, height: 5 },
    })

    // Handles (surface), badge (accent), badge text (on accent), marquee (soft).
    expect(fills).toContain('#1C1E21')
    expect(fills).toContain('#4FD1C5')
    expect(fills).toContain('#062420')
    expect(fills).toContain('#1D3836')
  })
})

describe('renderScene background', () => {
  const rect = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })

  test('paints the background after clearing and before the first element', () => {
    const ctx = fakeContext()
    const rough = fakeRough()
    const order: string[] = []
    ctx.fillRect.mockImplementation(() => order.push('background'))
    rough.rectangle.mockImplementation(() => order.push('element'))

    renderScene(
      ctx,
      rough,
      [rect],
      { width: 50, height: 40, dpr: 1, background: '#123456' },
      IDENTITY,
    )

    expect(order).toEqual(['background', 'element'])
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 50, 40)
  })

  test('stays transparent when no background is given', () => {
    const ctx = fakeContext()

    renderScene(
      ctx,
      fakeRough(),
      [rect],
      { width: 50, height: 40, dpr: 1 },
      IDENTITY,
    )

    expect(ctx.fillRect).not.toHaveBeenCalled()

describe('viewport culling (roadmap 2.12)', () => {
  function drawn(
    elements: Parameters<typeof renderScene>[2],
    viewport = IDENTITY,
  ) {
    const rough = fakeRough()
    renderScene(fakeContext(), rough, elements, SURFACE, viewport)
    return rough
  }

  test('skips an element wholly outside the visible area', () => {
    const away = [
      createShape('rectangle', { x: 2000, y: 10, width: 50, height: 50 }),
      createShape('rectangle', { x: -500, y: 10, width: 50, height: 50 }),
      createShape('rectangle', { x: 10, y: 2000, width: 50, height: 50 }),
      createShape('rectangle', { x: 10, y: -500, width: 50, height: 50 }),
    ]

    expect(drawn(away).rectangle).not.toHaveBeenCalled()
  })

  test('draws elements inside, and those only partly visible', () => {
    const inside = createShape('rectangle', {
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    })
    const edge = createShape('rectangle', {
      x: 780,
      y: 580,
      width: 100,
      height: 100,
    })

    expect(drawn([inside, edge]).rectangle).toHaveBeenCalledTimes(2)
  })

  test('follows the camera: position and zoom decide what is visible', () => {
    const far = createShape('rectangle', {
      x: 3000,
      y: 3000,
      width: 50,
      height: 50,
    })

    expect(drawn([far]).rectangle).not.toHaveBeenCalled()
    // Panned over it.
    expect(
      drawn([far], { x: 2900, y: 2900, zoom: 1 }).rectangle,
    ).toHaveBeenCalled()
    // Zoomed out far enough to see it: the window shows 8000 x 6000 units.
    expect(drawn([far], { x: 0, y: 0, zoom: 0.1 }).rectangle).toHaveBeenCalled()
  })

  test('a line, arrow or stroke is judged by its points, not by (x, y)', () => {
    // Starts off screen to the right and reaches back into view.
    const line = createLinear('line', {
      x: 1000,
      y: 100,
      width: 400,
      height: 0,
      points: [
        [0, 0],
        [-400, 0],
      ],
    })

    expect(drawn([line]).linearPath).toHaveBeenCalled()
  })

  test('a rotated element is kept while any of its corners can reach the view', () => {
    // A tall box whose centre is off screen but which, turned a quarter, reaches in.
    const tall = {
      ...createShape('rectangle', { x: 850, y: 250, width: 20, height: 400 }),
      angle: Math.PI / 2,
    }

    expect(drawn([tall]).rectangle).toHaveBeenCalled()
  })

  test('keeps a narrow shape whose wider label reaches into the view', () => {
    // The 36 px label is centred on the shape and 144 units wide at least, so
    // it spans x 773 to 917 although the shape starts at 840.
    const narrow = {
      ...createShape('rectangle', { x: 840, y: 100, width: 10, height: 10 }),
      label: {
        text: 'WWWWWW',
        fontFamily: 'mono' as const,
        fontSize: 36,
        textAlign: 'center' as const,
      },
    }

    expect(drawn([narrow]).rectangle).toHaveBeenCalled()
  })

  test('allows for rough.js bending a very large shape beyond its box', () => {
    // The box ends 50 units left of the view; the rough outline of a shape
    // this big can reach several hundred units past its box.
    const huge = createShape('ellipse', {
      x: -10050,
      y: 100,
      width: 10000,
      height: 100,
    })

    expect(drawn([huge]).ellipse).toHaveBeenCalled()
  })

  test('keeps a note whose shadow, fixed in screen pixels, is still visible', () => {
    // Zoomed out to 0.1, the note ends 3 screen pixels above the window, and
    // its shadow (10 px blur, 3 px down) reaches in.
    const note = createNote({ x: 100, y: -50, width: 20, height: 20 })
    const ctx = fakeContext()

    renderScene(ctx, fakeRough(), [note], SURFACE, {
      x: 0,
      y: 0,
      zoom: 0.1,
    })

    expect(ctx.fill).toHaveBeenCalled()
  })

  test('draws the selection overlay even when the element is off screen', () => {
    const ctx = fakeContext()
    const far = createShape('rectangle', {
      x: 5000,
      y: 5000,
      width: 50,
      height: 50,
    })

    renderScene(ctx, fakeRough(), [far], SURFACE, IDENTITY, {
      selected: [far],
      marquee: null,
    })

    expect(ctx.stroke).toHaveBeenCalled()
  })
})
