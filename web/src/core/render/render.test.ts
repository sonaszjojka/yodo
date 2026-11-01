import { describe, expect, test, vi } from 'vitest'
import { createRectangle } from '../document/create.ts'
import { canvasSize, renderScene, type SceneContext } from './render.ts'

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

describe('renderScene', () => {
  test('scales by the pixel ratio and clears the visible area', () => {
    const ctx = fakeContext()
    const rough = { rectangle: vi.fn() }

    renderScene(ctx, rough, [], { width: 800, height: 600, dpr: 2 }, IDENTITY)

    expect(ctx.setTransform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)
    expect(rough.rectangle).not.toHaveBeenCalled()
  })

  test('maps world to device pixels through the viewport', () => {
    const ctx = fakeContext()
    const rough = { rectangle: vi.fn() }

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
    const rough = { rectangle: vi.fn() }
    const rect = createRectangle({ x: 1, y: 2, width: 3, height: 4 }, 42)

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
      rectangle: vi.fn(() => {
        alphaWhileDrawing = ctx.globalAlpha
      }),
    }
    const rect = {
      ...createRectangle({ x: 0, y: 0, width: 5, height: 5 }, 7),
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
})
