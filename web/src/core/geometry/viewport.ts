// The camera onto the infinite canvas. (x, y) is the world point shown at the
// screen's top-left corner, so:
//   screen = (world - (x, y)) * zoom
//   world  = screen / zoom + (x, y)
// Screen points are CSS pixels relative to the canvas.
import type { AppState, Point } from '../document/types.ts'

export type Viewport = AppState['viewport']

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 30

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function screenToWorld(v: Viewport, [sx, sy]: Point): Point {
  return [sx / v.zoom + v.x, sy / v.zoom + v.y]
}

export function worldToScreen(v: Viewport, [wx, wy]: Point): Point {
  return [(wx - v.x) * v.zoom, (wy - v.y) * v.zoom]
}

/** Moves the content by a screen-pixel delta, as if dragging it. */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }
}

/**
 * Changes the zoom (clamped) while the world point under `anchor` stays under
 * it. This is what makes zooming feel like it happens "at the cursor".
 */
export function zoomAt(v: Viewport, anchor: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom)
  const [wx, wy] = screenToWorld(v, anchor)
  return { zoom, x: wx - anchor[0] / zoom, y: wy - anchor[1] / zoom }
}

/** The largest zoom ratio one wheel event may apply (one mouse notch). */
const MAX_WHEEL_STEP = 1.25

/**
 * The zoom multiplier for a wheel delta (pixels). Exponential, so in and out
 * are symmetric and tiny pinch deltas feel smooth. Capped per event, because a
 * mouse notch arrives as a single ~100 px delta and would otherwise jump ~2.7x.
 */
export function wheelZoomFactor(deltaY: number): number {
  const factor = Math.exp(-deltaY * 0.01)
  return Math.min(MAX_WHEEL_STEP, Math.max(1 / MAX_WHEEL_STEP, factor))
}
