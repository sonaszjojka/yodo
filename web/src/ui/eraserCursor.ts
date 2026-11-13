import { HIT_TOLERANCE } from '../core/editor/editor.ts'

/** Space around the circle so the ring's stroke isn't clipped. */
const PAD = 2
const SIZE = 2 * (HIT_TOLERANCE + PAD)
const CENTER = SIZE / 2

/**
 * The eraser's cursor: a circle with the eraser's reach as its radius. The
 * reach is `HIT_TOLERANCE` screen pixels at any zoom (the editor divides it by
 * the zoom), so the cursor never needs to change size. Hit-testing measures
 * a circular distance, so the circle is the reach off corners too (#142); a
 * shape's stroke widens it by half the stroke width.
 *
 * A light ring outside a dark one keeps it visible on both themes. The
 * hotspot is the centre; `crosshair` is the fallback if the image is refused.
 */
export const ERASER_CURSOR = (() => {
  const ring = (r: number, stroke: string) =>
    `<circle cx='${CENTER}' cy='${CENTER}' r='${r}' fill='none' stroke='${stroke}' stroke-width='1'/>`
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}'>` +
    ring(HIT_TOLERANCE + 0.5, 'white') +
    ring(HIT_TOLERANCE - 0.5, 'black') +
    `</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${CENTER} ${CENTER}, crosshair`
})()
