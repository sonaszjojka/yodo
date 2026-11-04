// Where the contextual style bar goes on screen (docs/ui.md, roadmap 2.1).
import type { Bounds } from '../core/geometry/rect.ts'

/** Screen px between the selection outline and the bar, and the window edge. */
const GAP = 8
export const BUTTON = 40
/** 40 px buttons, 4 px padding, 1 px border (`.style-bar` in index.css). */
const BAR_HEIGHT = BUTTON + 2 * 4 + 2
/** Below the tool toolbar (top 16 + 44 px buttons + padding), plus a gap. */
const SAFE_TOP = 76

export interface Size {
  width: number
  height: number
}

/**
 * Where the bar goes (screen px, top-left): centred above `outline`, or below
 * it when the toolbar is in the way, always inside the window.
 */
export function barPosition(
  outline: Bounds,
  barWidth: number,
  window: Size,
): { left: number; top: number } {
  const centre = outline.x + outline.width / 2
  const left = Math.min(
    Math.max(centre - barWidth / 2, GAP),
    window.width - GAP - barWidth,
  )
  const above = outline.y - GAP - BAR_HEIGHT
  const top =
    above >= SAFE_TOP
      ? above
      : Math.min(
          outline.y + outline.height + GAP,
          window.height - GAP - BAR_HEIGHT,
        )
  return { left, top: Math.max(top, SAFE_TOP) }
}

/** The bar's width for `count` controls, so it can be placed before layout. */
export function barWidth(count: number) {
  return count * BUTTON + (count - 1) * 2 + 2 * 4 + 2
}
