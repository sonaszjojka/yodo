import { describe, expect, test } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
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
})
