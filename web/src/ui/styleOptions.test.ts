import { expect, test } from 'vitest'
import { createNote, createShape } from '../core/document/create.ts'
import { adaptColor } from '../core/render/colors.ts'
import { FILLS, fillsFor, STROKES } from './styleOptions.ts'

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

const box = { x: 0, y: 0, width: 10, height: 10 }

test('a selection of only notes cannot pick "None" (ADR 0038)', () => {
  const fills = fillsFor([createNote(box), createNote(box)])
  expect(fills.map(({ label }) => label)).not.toContain('None')
  expect(fills).toHaveLength(FILLS.length - 1)
})

test('a note mixed with a shape, or no selection, keeps "None"', () => {
  expect(fillsFor([createNote(box), createShape('rectangle', box)])).toBe(FILLS)
  expect(fillsFor([])).toBe(FILLS)
})
