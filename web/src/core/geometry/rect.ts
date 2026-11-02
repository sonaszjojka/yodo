import type { Point } from '../document/types.ts'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The rectangle spanned by a drag from `start` to `end`, normalised so width
 * and height are never negative. With `square`, both sides take the longer
 * drag distance and the square grows toward the cursor.
 */
export function rectFromDrag(
  start: Point,
  end: Point,
  square: boolean,
): Bounds {
  let dx = end[0] - start[0]
  let dy = end[1] - start[1]
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    // Math.sign(0) is 0, so treat a zero delta as positive to keep the side.
    dx = side * (dx < 0 ? -1 : 1)
    dy = side * (dy < 0 ? -1 : 1)
  }
  return {
    x: Math.min(start[0], start[0] + dx),
    y: Math.min(start[1], start[1] + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  }
}

/** A diamond's corners in its box: the midpoints of the box's edges. */
export function diamondPoints({ x, y, width, height }: Bounds): Point[] {
  return [
    [x + width / 2, y],
    [x + width, y + height / 2],
    [x + width / 2, y + height],
    [x, y + height / 2],
  ]
}
