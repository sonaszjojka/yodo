import { expect, test } from 'vitest'
import { adaptColor } from '../core/render/colors.ts'
import { FILLS, STROKES } from './styleOptions.ts'

// The palette lives here (light values) and its dark twins in core: this
// keeps the two tables in step, so no palette colour falls to the algorithm.
test('every palette colour has a dark twin', () => {
  for (const { value } of STROKES) {
    expect(adaptColor(value, 'dark', 'stroke')).not.toBe(value)
  }
  for (const { value } of FILLS) {
    if (value === 'transparent') continue
    expect(adaptColor(value, 'dark', 'fill')).not.toBe(value)
  }
})
