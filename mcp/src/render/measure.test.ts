import { describe, expect, it } from 'vitest'
import { estimateMeasure, fontOf } from '../../../web/src/core/text/layout.ts'
import { FONT_FILES } from './fonts.ts'
import { nodeMeasure } from './measure.ts'

describe('nodeMeasure', () => {
  const measure = nodeMeasure()

  it('measures with the real font, not the estimate', () => {
    const font = fontOf('sans', 20)
    const width = measure('Hello world', font)
    expect(width).toBeGreaterThan(0)
    expect(
      Math.abs(width - estimateMeasure('Hello world', font)),
    ).toBeGreaterThan(2)
  })

  it('gives JetBrains Mono its 0.6 em advance', () => {
    expect(measure('0123456789', fontOf('mono', 20))).toBeCloseTo(120, 0)
  })

  it('tells the families apart', () => {
    const hand = measure('Hello world', fontOf('hand', 20))
    const sans = measure('Hello world', fontOf('sans', 20))
    expect(hand).toBeLessThan(sans)
  })

  it('measures Cyrillic with the bundled subset, not a fallback', () => {
    // A monospace font gives every glyph it has the same advance, so a
    // Cyrillic string at 0.6 em per character proves the subset is in use.
    expect(measure('Привет', fontOf('mono', 20))).toBeCloseTo(72, 0)
  })

  it('returns the same function each time (fonts registered once)', () => {
    expect(nodeMeasure()).toBe(measure)
  })
})

describe('FONT_FILES', () => {
  it('holds every subset the SVG export may embed, as base64 woff2', () => {
    expect(Object.keys(FONT_FILES.hand)).toHaveLength(4)
    expect(Object.keys(FONT_FILES.sans)).toHaveLength(6)
    expect(Object.keys(FONT_FILES.mono)).toHaveLength(6)
    // "wOF2" is the woff2 signature.
    const bytes = Buffer.from(FONT_FILES.sans.latin!, 'base64')
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2')
  })
})
