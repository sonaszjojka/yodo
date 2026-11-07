import { describe, expect, test } from 'vitest'
import { HIT_TOLERANCE } from '../core/editor/editor.ts'
import { ERASER_CURSOR } from './eraserCursor.ts'

function parse() {
  const match =
    /^url\("data:image\/svg\+xml,([^"]+)"\) (\d+) (\d+), crosshair$/.exec(
      ERASER_CURSOR,
    )
  expect(match).not.toBeNull()
  return { svg: decodeURIComponent(match![1]), x: +match![2], y: +match![3] }
}

describe('ERASER_CURSOR', () => {
  test('is a circle as wide as the eraser reaches, with a crosshair fallback', () => {
    const { svg } = parse()
    const radii = [...svg.matchAll(/ r='([\d.]+)'/g)].map((m) => +m[1])
    // The two rings straddle the hit radius.
    expect(Math.min(...radii)).toBeCloseTo(HIT_TOLERANCE - 0.5)
    expect(Math.max(...radii)).toBeCloseTo(HIT_TOLERANCE + 0.5)
  })

  test('has its hotspot at the centre of the image', () => {
    const { svg, x, y } = parse()
    const size = +/width='(\d+)'/.exec(svg)![1]
    expect([x, y]).toEqual([size / 2, size / 2])
    expect(size).toBeGreaterThan(2 * HIT_TOLERANCE)
  })
})
