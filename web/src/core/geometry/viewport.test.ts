import { describe, expect, test } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitViewport,
  panBy,
  screenToWorld,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type Viewport,
} from './viewport.ts'

const v: Viewport = { x: 100, y: -50, zoom: 2 }

describe('screen ↔ world', () => {
  test('converts known points both ways', () => {
    expect(screenToWorld(v, [0, 0])).toEqual([100, -50])
    expect(screenToWorld(v, [40, 60])).toEqual([120, -20])
    expect(worldToScreen(v, [120, -20])).toEqual([40, 60])
  })

  test('the identity viewport leaves points unchanged', () => {
    const identity = { x: 0, y: 0, zoom: 1 }
    expect(screenToWorld(identity, [7, 9])).toEqual([7, 9])
    expect(worldToScreen(identity, [7, 9])).toEqual([7, 9])
  })

  test.each([
    [{ x: 0, y: 0, zoom: 1 }],
    [{ x: 12.5, y: -300, zoom: 0.3 }],
    [{ x: -1e4, y: 42, zoom: 17 }],
  ])('round-trips screen → world → screen at %o', (viewport) => {
    const [x, y] = worldToScreen(viewport, screenToWorld(viewport, [123, 456]))
    expect(x).toBeCloseTo(123)
    expect(y).toBeCloseTo(456)
  })
})

describe('panBy', () => {
  test('moves the content with the pointer, scaled by zoom', () => {
    // Dragging 20 screen px right at zoom 2 shows 10 world units further left.
    expect(panBy(v, 20, -10)).toEqual({ x: 90, y: -45, zoom: 2 })
  })
})

describe('zoomAt', () => {
  test('keeps the world point under the anchor fixed', () => {
    const anchor: [number, number] = [300, 200]
    const before = screenToWorld(v, anchor)
    const next = zoomAt(v, anchor, 5)

    expect(next.zoom).toBe(5)
    const after = screenToWorld(next, anchor)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
  })

  test('clamps the zoom and still keeps the anchor fixed', () => {
    const next = zoomAt(v, [10, 10], 1000)
    expect(next.zoom).toBe(MAX_ZOOM)
    expect(screenToWorld(next, [10, 10])[0]).toBeCloseTo(
      screenToWorld(v, [10, 10])[0],
    )
  })
})

describe('clampZoom', () => {
  test.each([
    [0.01, MIN_ZOOM],
    [1, 1],
    [1000, MAX_ZOOM],
  ])('clamps %d to %d', (zoom, expected) => {
    expect(clampZoom(zoom)).toBe(expected)
  })
})

describe('wheelZoomFactor', () => {
  test('no movement keeps the zoom', () => {
    expect(wheelZoomFactor(0)).toBe(1)
  })

  test('scrolling up zooms in, down zooms out, symmetrically', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1)
  })

  test('one mouse-wheel notch zooms at most one step of 1.25x', () => {
    // Chrome reports ~100 px per notch (120 on some setups).
    expect(wheelZoomFactor(-120)).toBeLessThanOrEqual(1.25)
    expect(wheelZoomFactor(120)).toBeGreaterThanOrEqual(1 / 1.25)
  })

  test('small trackpad-pinch deltas are not slowed down by the cap', () => {
    expect(wheelZoomFactor(-5)).toBeCloseTo(Math.exp(0.05))
  })
})

describe('fitViewport', () => {
  const size = { width: 200, height: 100 }

  test('zooms out a large box to fit inside the padding, centred', () => {
    // 400 × 100 into 180 × 80 (10 px padding): width limits, zoom 0.45.
    const v = fitViewport({ x: 0, y: 0, width: 400, height: 100 }, size, 10)

    expect(v.zoom).toBeCloseTo(0.45)
    // The box centre (200, 50) lands on the surface centre (100, 50).
    expect(worldToScreen(v, [200, 50])[0]).toBeCloseTo(100)
    expect(worldToScreen(v, [200, 50])[1]).toBeCloseTo(50)
  })

  test('never zooms in past maxZoom, so a small drawing keeps its size', () => {
    const v = fitViewport({ x: 50, y: 50, width: 20, height: 10 }, size, 10)

    expect(v.zoom).toBe(1)
    expect(worldToScreen(v, [60, 55])).toEqual([100, 50])
  })

  test('a zero-size box (a single point) is centred at maxZoom', () => {
    const v = fitViewport({ x: 5, y: 5, width: 0, height: 0 }, size, 10)

    expect(v.zoom).toBe(1)
    expect(worldToScreen(v, [5, 5])).toEqual([100, 50])
  })

  test('fits a huge box below MIN_ZOOM, so it is never cropped', () => {
    const v = fitViewport({ x: 0, y: 0, width: 1e5, height: 1e5 }, size, 10)

    expect(v.zoom).toBeCloseTo(80 / 1e5)
    expect(v.zoom).toBeLessThan(MIN_ZOOM)
  })
})
