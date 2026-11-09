import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import { createDocument } from '../document/create.ts'
import type { ArrowElement } from '../document/types.ts'
import { lineFromDrag } from '../geometry/line.ts'
import { applyArrowhead, commonArrowhead, headAt } from './arrowhead.ts'

const arrow = createLinear('arrow', lineFromDrag([0, 0], [50, 0], false))
const other = { ...arrow, id: 'other', endArrowhead: 'bar' as const }
const line = createLinear('line', lineFromDrag([0, 0], [50, 0], false))
const box = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })
const doc = { ...createDocument(), elements: [arrow, other, line, box] }

describe('commonArrowhead', () => {
  test('a new arrow: an arrow at the end and nothing at the start', () => {
    expect(commonArrowhead([arrow], 'end')).toBe('arrow')
    expect(commonArrowhead([arrow], 'start')).toBeNull()
  })

  test('arrows that differ are mixed; other elements do not count', () => {
    expect(commonArrowhead([arrow, other, line, box], 'end')).toBe('mixed')
    expect(commonArrowhead([arrow, other], 'start')).toBeNull()
  })

  test('a selection with no arrow has no value', () => {
    expect(commonArrowhead([line, box], 'end')).toBeUndefined()
  })
})

describe('applyArrowhead', () => {
  test('sets a start head on the selected arrows only', () => {
    const next = applyArrowhead(doc, [arrow.id, line.id], 'start', 'triangle')
    const [a, o, l] = next.elements as ArrowElement[]
    expect(a!.startArrowhead).toBe('triangle')
    expect(o).toBe(other)
    expect(l).toBe(line)
  })

  test('sets and removes the end head', () => {
    const none = applyArrowhead(doc, [arrow.id], 'end', null)
    expect(headAt(none.elements[0] as ArrowElement, 'end')).toBeNull()
    expect(none.elements[0]).toHaveProperty('endArrowhead', null)
  })

  test('a start head of none removes the field', () => {
    const set = applyArrowhead(doc, [arrow.id], 'start', 'bar')
    const cleared = applyArrowhead(set, [arrow.id], 'start', null)
    expect(cleared.elements[0]).not.toHaveProperty('startArrowhead')
  })

  test('the same document comes back when nothing changes', () => {
    expect(applyArrowhead(doc, [arrow.id], 'end', 'arrow')).toBe(doc)
    expect(applyArrowhead(doc, [arrow.id], 'start', null)).toBe(doc)
    expect(applyArrowhead(doc, [line.id, box.id], 'end', 'bar')).toBe(doc)
  })
})
