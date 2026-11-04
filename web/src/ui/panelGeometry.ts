// Where the style panel sits and how big it is (docs/ui.md, Editing styles):
// pure functions on screen-px boxes, so dragging and resizing are tested
// without a DOM. The panel always stays inside the window.
import type { Bounds } from '../core/geometry/rect.ts'
import type { Size } from './barPosition.ts'

/** Screen px between the panel and the window edge. */
const GAP = 16
/** Below the top bar (top 16 + 44 px buttons + padding), plus a gap. */
const TOP = 76
export const MIN_WIDTH = 240
export const MAX_WIDTH = 520
export const MIN_HEIGHT = 200
const DEFAULT_WIDTH = 280
const DEFAULT_HEIGHT = 560

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

/** The place "snap back" returns to: at the right side, under the top bar. */
export function defaultPlace(window: Size): Bounds {
  const width = DEFAULT_WIDTH
  const height = DEFAULT_HEIGHT
  return clampPlace(
    { x: window.width - GAP - width, y: TOP, width, height },
    window,
  )
}

/**
 * `place` made to fit `window`: the size within its limits (smaller in a tiny
 * window), then the position so the whole panel is inside.
 */
export function clampPlace(place: Bounds, window: Size): Bounds {
  const room = {
    width: Math.max(window.width - 2 * GAP, 0),
    height: Math.max(window.height - 2 * GAP, 0),
  }
  const width = Math.min(clamp(place.width, MIN_WIDTH, MAX_WIDTH), room.width)
  const height = Math.min(Math.max(place.height, MIN_HEIGHT), room.height)
  return {
    x: clamp(place.x, GAP, window.width - GAP - width),
    y: clamp(place.y, GAP, window.height - GAP - height),
    width,
    height,
  }
}

/** `start` moved by a header drag of (dx, dy). */
export function dragPlace(
  start: Bounds,
  dx: number,
  dy: number,
  window: Size,
): Bounds {
  return clampPlace({ ...start, x: start.x + dx, y: start.y + dy }, window)
}

export type ResizeEdge = 'left' | 'corner'

/**
 * `start` resized by dragging its left edge (width) or bottom-left corner
 * (width and height). The right edge and the top stay where they are.
 */
export function resizePlace(
  start: Bounds,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  window: Size,
): Bounds {
  const right = start.x + start.width
  const maxWidth = Math.min(MAX_WIDTH, right - GAP)
  const width = clamp(
    start.width - dx,
    MIN_WIDTH,
    Math.max(maxWidth, MIN_WIDTH),
  )
  const height =
    edge === 'corner'
      ? clamp(
          start.height + dy,
          MIN_HEIGHT,
          Math.max(window.height - GAP - start.y, MIN_HEIGHT),
        )
      : start.height
  return clampPlace({ x: right - width, y: start.y, width, height }, window)
}
