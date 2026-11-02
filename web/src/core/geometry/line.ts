import type { Point } from '../document/types.ts'

/** The position and points of a line or arrow (ADR 0013 element fields). */
export interface LinearGeometry {
  /** The first point, in world coordinates; `points` are relative to it. */
  x: number
  y: number
  /** Size of the points' bounding box, never negative. */
  width: number
  height: number
  points: Point[]
}

/** Shift snaps line angles to multiples of this (15°). */
const SNAP_ANGLE = Math.PI / 12

/** Below this, a snapped coordinate is floating-point noise, not a real offset. */
const EPSILON = 1e-9

function clean(value: number) {
  return Math.abs(value) < EPSILON ? 0 : value
}

/**
 * The straight line dragged from `start` to `end`. Unlike a rectangle, the
 * start stays the origin, so the points can be negative. With `snap`, the
 * angle snaps to the nearest 15° step and the length is kept.
 */
export function lineFromDrag(
  start: Point,
  end: Point,
  snap: boolean,
): LinearGeometry {
  let dx = end[0] - start[0]
  let dy = end[1] - start[1]
  if (snap) {
    const length = Math.hypot(dx, dy)
    const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE
    // cos(90°) is 6e-17, not 0: clean it so vertical lines are exactly vertical.
    dx = clean(length * Math.cos(angle))
    dy = clean(length * Math.sin(angle))
  }
  return {
    x: start[0],
    y: start[1],
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [
      [0, 0],
      [dx, dy],
    ],
  }
}

/** The arrowhead's wing length in world units, on lines long enough for it. */
export const ARROWHEAD_LENGTH = 20
/** Angle between each wing and the line. */
const WING_ANGLE = Math.PI / 6
/** On short lines the head takes at most this share of the length. */
const MAX_HEAD_SHARE = 0.4

/**
 * The open arrowhead at `to` for a segment coming from `from`, as a path
 * `[left wing, tip, right wing]` in the same coordinates as the inputs.
 */
export function arrowhead(from: Point, to: Point): [Point, Point, Point] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const size = Math.min(ARROWHEAD_LENGTH, length * MAX_HEAD_SHARE)
  // The direction pointing back from the tip along the line.
  const back = Math.atan2(from[1] - to[1], from[0] - to[0])
  const wing = (angle: number): Point => [
    to[0] + size * Math.cos(angle),
    to[1] + size * Math.sin(angle),
  ]
  return [wing(back - WING_ANGLE), to, wing(back + WING_ANGLE)]
}
