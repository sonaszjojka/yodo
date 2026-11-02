import { expect, test } from 'vitest'
import { createDocument, createShape } from '../document/create.ts'
import { createEditor } from './editor.ts'
import { sceneOf } from './scene.ts'

const a = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })
const b = createShape('rectangle', { x: 50, y: 0, width: 10, height: 10 })

function stateWith(patch: object) {
  const editor = createEditor({ ...createDocument(), elements: [a, b] })
  return { ...editor.store.getState(), ...patch }
}

test('shows the document as it is when nothing is going on', () => {
  const scene = sceneOf(stateWith({}))
  expect(scene).toEqual({ elements: [a, b], selected: [], marquee: null })
})

test('shows the selection shifted by the move in progress', () => {
  const scene = sceneOf(
    stateWith({ selectedIds: [b.id], move: { dx: 5, dy: 7 } }),
  )
  expect(scene.elements[0]).toBe(a)
  expect(scene.elements[1]).toMatchObject({ x: 55, y: 7 })
  // The overlay follows the shifted element.
  expect(scene.selected).toEqual([scene.elements[1]])
})

test('draws the draft on top', () => {
  const draft = createShape('ellipse', { x: 0, y: 0, width: 5, height: 5 })
  expect(sceneOf(stateWith({ draft })).elements).toEqual([a, b, draft])
})
