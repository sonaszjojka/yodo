import { describe, expect, test, vi } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import { arrowhead, lineFromDrag } from '../geometry/line.ts'
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
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
  } satisfies SceneContext
}

function fakeRough() {
  return {
    rectangle: vi.fn(),
    polygon: vi.fn(),
    ellipse: vi.fn(),
    linearPath: vi.fn(),
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
