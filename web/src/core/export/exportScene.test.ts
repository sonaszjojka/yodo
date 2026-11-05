import { describe, expect, test, vi } from 'vitest'
import {
  createImage,
  createLinear,
  createShape,
  DEFAULT_LABEL,
} from '../document/create.ts'
import type { Measure } from '../text/layout.ts'
import { DARK_CANVAS, LIGHT_CANVAS } from '../render/colors.ts'
import {
  EXPORT_PADDING,
  exportElements,
  exportFrame,
  exportSize,
  renderExport,
  scaleFits,
} from './exportScene.ts'

// Every character is 10 px wide, whatever the font.
const measure: Measure = (text) => text.length * 10

const a = createShape('rectangle', { x: 0, y: 0, width: 100, height: 50 })
const b = createShape('ellipse', { x: 200, y: 100, width: 40, height: 40 })

describe('exportElements', () => {
  test('exports everything in document order', () => {
    expect(exportElements([a, b], [b.id], 'all')).toEqual([a, b])
  })

  test('exports only the selection, in document order, ignoring unknown ids', () => {
    expect(exportElements([a, b], [b.id, 'gone', a.id], 'selection')).toEqual([
      a,
      b,
    ])
    expect(exportElements([a, b], [b.id], 'selection')).toEqual([b])
    expect(exportElements([a, b], [], 'selection')).toEqual([])
  })
})

describe('exportFrame', () => {
  test('pads the union of the elements', () => {
    expect(exportFrame([a, b], measure)).toEqual({
      x: -EXPORT_PADDING,
      y: -EXPORT_PADDING,
      width: 240 + 2 * EXPORT_PADDING,
      height: 140 + 2 * EXPORT_PADDING,
    })
  })

  test('is undefined with nothing to export', () => {
    expect(exportFrame([], measure)).toBeUndefined()
  })

  test('handles negative coordinates and points left of the origin', () => {
    const arrow = createLinear('arrow', {
      x: 50,
      y: 50,
      width: 80,
      height: 40,
      points: [
        [0, 0],
        [-80, -40],
      ],
    })
    expect(exportFrame([arrow], measure, 0)).toEqual({
      x: -30,
      y: 10,
      width: 80,
      height: 40,
    })
  })

  test('includes a label that overflows a shape resized too small', () => {
    // 2 lines of 40 px text in a 20 px tall box: the text sticks out above
    // and below, and sideways past the minimum label width (ADR 0026).
    const shape = {
      ...createShape('rectangle', { x: 0, y: 0, width: 20, height: 20 }),
      label: { ...DEFAULT_LABEL, text: 'wide label\nsecond' },
    }
    const frame = exportFrame([shape], measure, 0)!
    expect(frame.y).toBeLessThan(0)
    expect(frame.y + frame.height).toBeGreaterThan(20)
    expect(frame.x).toBeLessThan(0)
    expect(frame.x + frame.width).toBeGreaterThan(20)
  })

  test('ignores an empty label', () => {
    const shape = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    })
    expect(exportFrame([shape], measure, 0)).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    })
  })
})

describe('exportSize and scaleFits', () => {
  const frame = { x: 0, y: 0, width: 100.2, height: 50 }

  test('rounds up to whole pixels', () => {
    expect(exportSize(frame, 2)).toEqual({ width: 201, height: 100 })
  })

  test('accepts a normal size and rejects one past the side or area limit', () => {
    expect(scaleFits(frame, 3)).toBe(true)
    expect(scaleFits({ ...frame, width: 6000 }, 3)).toBe(false)
    expect(scaleFits({ x: 0, y: 0, width: 5000, height: 5000 }, 2)).toBe(false)
    expect(scaleFits({ x: 0, y: 0, width: 5000, height: 5000 }, 1)).toBe(true)
  })
})

describe('renderExport', () => {
  function setup() {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillStyle: '',
    }
    const canvas = { width: 0, height: 0, getContext: () => ctx as never }
    const rough = {
      rectangle: vi.fn(),
      polygon: vi.fn(),
      ellipse: vi.fn(),
      linearPath: vi.fn(),
      path: vi.fn(),
    }
    return { ctx, canvas, rough }
  }
  const frame = { x: -16, y: -16, width: 132, height: 82 }

  test('sizes the canvas to the frame at the scale and maps the frame to its corner', () => {
    const { ctx, canvas, rough } = setup()
    renderExport(canvas, rough, [a], frame, {
      scale: 2,
      theme: 'light',
      background: true,
    })

    expect([canvas.width, canvas.height]).toEqual([264, 164])
    // renderScene's camera transform: scale 2, frame origin at (0, 0).
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 32, 32)
    expect(rough.rectangle).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['light', LIGHT_CANVAS],
    ['dark', DARK_CANVAS],
  ] as const)(
    'paints the %s page colour only with a background',
    (theme, color) => {
      const withBackground = setup()
      renderExport(withBackground.canvas, withBackground.rough, [a], frame, {
        scale: 1,
        theme,
        background: true,
      })
      expect(withBackground.ctx.fillRect).toHaveBeenCalledTimes(1)
      expect(withBackground.ctx.fillStyle).toBe(color)

      const without = setup()
      renderExport(without.canvas, without.rough, [a], frame, {
        scale: 1,
        theme,
        background: false,
      })
      expect(without.ctx.fillRect).not.toHaveBeenCalled()
    },
  )

  test('draws the pictures of image elements from the given lookup', () => {
    const { ctx, canvas, rough } = setup()
    const image = createImage(
      'hash-1',
      { width: 100, height: 50 },
      { x: 0, y: 0, width: 1000, height: 1000 },
    )
    const picture = {} as CanvasImageSource
    const images = vi.fn(() => picture)

    renderExport(canvas, rough, [image], frame, {
      scale: 1,
      theme: 'light',
      background: false,
      images,
    })

    expect(images).toHaveBeenCalledWith('hash-1')
    expect(ctx.drawImage).toHaveBeenCalledWith(
      picture,
      image.x,
      image.y,
      image.width,
      image.height,
    )
  })
})
