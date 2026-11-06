import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import { lineFromDrag } from '../geometry/line.ts'
import { elementBounds } from '../geometry/rect.ts'
import {
  MAX_PAYLOAD_LENGTH,
  parseClipboard,
  pasteElements,
  serializeClipboard,
} from './clipboard.ts'
import { DUPLICATE_OFFSET } from './selection.ts'

const rect = createShape('rectangle', { x: 100, y: 100, width: 50, height: 50 })
const line = createLinear('line', lineFromDrag([0, 0], [20, 10], false))
const view = { x: 0, y: 0, width: 500, height: 400 }

function ids() {
  let n = 0
  return () => `new-${++n}`
}

describe('serialize / parse', () => {
  test('round-trips elements', () => {
    const text = serializeClipboard([rect, line])
    expect(parseClipboard(text)).toEqual([rect, line])
  })

  test('is not ours: plain text, other JSON, wrong marker or version', () => {
    expect(parseClipboard('hello')).toBeNull()
    expect(parseClipboard('{"a":1}')).toBeNull()
    expect(parseClipboard('[1,2]')).toBeNull()
    expect(
      parseClipboard(
        '{"type":"excalidraw/clipboard","version":1,"elements":[]}',
      ),
    ).toBeNull()
    expect(
      parseClipboard('{"type":"yodo/clipboard","version":2,"elements":[]}'),
    ).toBeNull()
  })

  test('ours but with bad elements: only the valid ones come back', () => {
    const text = JSON.stringify({
      type: 'yodo/clipboard',
      version: 1,
      elements: [rect, { type: 'star' }],
    })
    expect(parseClipboard(text)).toEqual([rect])
  })

  test('refuses an oversized payload without parsing it', () => {
    expect(parseClipboard('x'.repeat(MAX_PAYLOAD_LENGTH + 1))).toBeNull()
  })
})

describe('pasteElements', () => {
  test('gives fresh ids, keeps seeds and everything else', () => {
    const [copy] = pasteElements([rect], view, 0, ids())
    expect(copy).toEqual({ ...rect, id: 'new-1' })
  })

  test('stays where it was when that spot is in view', () => {
    const [copy] = pasteElements([rect], view, 0, ids())
    expect(copy!.x).toBe(100)
    expect(copy!.y).toBe(100)
  })

  test('each step shifts by the duplicate offset', () => {
    const [copy] = pasteElements([rect], view, 2, ids())
    expect(copy!.x).toBe(100 + 2 * DUPLICATE_OFFSET)
    expect(copy!.y).toBe(100 + 2 * DUPLICATE_OFFSET)
  })

  test('centres the group on the view when it is out of view', () => {
    const far = { ...rect, x: 5000, y: 5000 }
    const farLine = { ...line, x: 5100, y: 5000 }
    const copies = pasteElements([far, farLine], view, 0, ids())
    const bounds = copies.map(elementBounds)
    const minX = Math.min(...bounds.map((b) => b.x))
    const maxX = Math.max(...bounds.map((b) => b.x + b.width))
    expect((minX + maxX) / 2).toBeCloseTo(250)
    // The group keeps its shape: the line stays where it was relative to far.
    expect(copies[1]!.x - copies[0]!.x).toBe(farLine.x - far.x)
  })

  test('a group partly in view counts as in view', () => {
    const edge = { ...rect, x: 480, y: 100 }
    const [copy] = pasteElements([edge], view, 0, ids())
    expect(copy!.x).toBe(480)
  })

  test('an empty list pastes nothing', () => {
    expect(pasteElements([], view, 0, ids())).toEqual([])
  })
})

describe('pasting attached arrows', () => {
  const arrow = {
    ...createLinear('arrow', lineFromDrag([150, 125], [300, 125], false)),
    startBinding: { elementId: rect.id, ratio: [1, 0.5] as [number, number] },
    endBinding: { elementId: 'elsewhere', ratio: [0, 0] as [number, number] },
  }

  test('a binding follows the pasted shape; one to a shape not copied is dropped', () => {
    const [pastedRect, pastedArrow] = pasteElements(
      [rect, arrow],
      view,
      0,
      ids(),
    )
    expect(pastedArrow).toMatchObject({
      startBinding: { elementId: pastedRect!.id },
    })
    expect(pastedArrow).not.toHaveProperty('endBinding')
  })
})
