import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { arrowheadOps } from '../core/geometry/arrowhead.ts'
import type { Arrowhead } from '../core/document/types.ts'
import { ArrowheadGlyph } from './ArrowheadGlyph.tsx'

/** The x-ranges the glyph's shaft is drawn over. */
function shaft(html: string) {
  return [...html.matchAll(/<line x1="([-\d.]+)"[^>]*x2="([-\d.]+)"/g)].map(
    (m): [number, number] => [Number(m[1]), Number(m[2])],
  )
}

/** The x-ranges that hollow shapes of `head` cover on the shaft. */
function hollow(head: Arrowhead): [number, number][] {
  return arrowheadOps(head, [-60, 0], [0, 0]).flatMap((op) => {
    if (op.kind === 'path' || op.filled) return []
    if (op.kind === 'circle') {
      return [[op.center[0] - op.diameter / 2, op.center[0] + op.diameter / 2]]
    }
    const xs = op.points.map((p) => p[0])
    return [[Math.min(...xs), Math.max(...xs)]]
  })
}

describe('ArrowheadGlyph', () => {
  test.each([
    'circle_outline',
    'triangle_outline',
    'diamond_outline',
    'cardinality_zero_or_one',
    'cardinality_zero_or_many',
  ] as const)('%s leaves no shaft inside its hollow shape', (head) => {
    const segments = shaft(
      renderToStaticMarkup(<ArrowheadGlyph head={head} end="end" />),
    )
    expect(segments.length).toBeGreaterThan(0)
    for (const [from, to] of hollow(head)) {
      for (const [a, b] of segments) {
        // No segment overlaps the open interval of the hollow shape.
        expect(Math.min(b, to) - Math.max(a, from)).toBeLessThanOrEqual(1e-6)
      }
    }
  })

  test('a filled head, none and mixed keep one unbroken shaft', () => {
    for (const head of ['triangle', 'arrow', null, 'mixed'] as const) {
      const html = renderToStaticMarkup(
        <ArrowheadGlyph head={head} end="start" />,
      )
      expect(shaft(html)).toEqual([[-31, 0]])
    }
  })
})
