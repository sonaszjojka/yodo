import { expect, test } from 'vitest'
import {
  createDocument,
  createLinear,
  createShape,
  createText,
} from '../document/create.ts'
import { lineFromDrag } from '../geometry/line.ts'
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
  expect(scene).toEqual({
    elements: [a, b],
    selected: [],
    marquee: null,
    bindTarget: null,
  })
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

test('shows the selection scaled by the resize in progress', () => {
  const scene = sceneOf(
    stateWith({
      selectedIds: [b.id],
      resize: { handle: 'e', anchor: [50, 0], sx: 3, sy: 1 },
    }),
  )
  expect(scene.elements[0]).toBe(a)
  expect(scene.elements[1]).toMatchObject({ x: 50, width: 30 })
  expect(scene.selected).toEqual([scene.elements[1]])
})

test('draws the draft on top', () => {
  const draft = createShape('ellipse', { x: 0, y: 0, width: 5, height: 5 })
  expect(sceneOf(stateWith({ draft })).elements).toEqual([a, b, draft])
})

test('hides the text being edited, which the textarea shows instead', () => {
  const text = { ...createText([0, 40], 1), text: 'hi', width: 22, height: 25 }
  const editor = createEditor({ ...createDocument(), elements: [a, text] })
  const state = {
    ...editor.store.getState(),
    editing: { target: 'text', id: text.id, text: 'hi' } as const,
  }
  expect(sceneOf(state).elements).toEqual([a])
})

test('draws a shape whose label is being edited without its label', () => {
  const label = {
    text: 'x',
    fontFamily: 'hand',
    fontSize: 20,
    textAlign: 'center',
  } as const
  const labelled = { ...a, label }
  const editor = createEditor({ ...createDocument(), elements: [labelled] })
  const state = {
    ...editor.store.getState(),
    editing: { target: 'label', id: a.id, text: 'x' } as const,
  }
  const [shown] = sceneOf(state).elements
  expect(shown).not.toHaveProperty('label')
  expect(shown).toMatchObject({ id: a.id, x: a.x })
})

test('shows the elements the eraser marked faded', () => {
  const scene = sceneOf(stateWith({ erasing: [b.id] }))
  expect(scene.elements[0]).toBe(a)
  expect(scene.elements[1]).toMatchObject({ id: b.id, opacity: 30 })
})

test('shows an arrow end being dragged, and resolves the highlight', () => {
  const arrow = createLinear('arrow', lineFromDrag([0, 30], [20, 30], false))
  const editor = createEditor({ ...createDocument(), elements: [a, b, arrow] })
  const scene = sceneOf({
    ...editor.store.getState(),
    endpoint: {
      elementId: arrow.id,
      index: 1,
      insert: false,
      point: [50, 5],
      binding: { elementId: b.id, ratio: [0, 0.5] },
    },
    bindTarget: b.id,
  })
  expect(scene.elements[0]).toBe(a)
  expect(scene.elements[2]).toMatchObject({
    points: [
      [0, 0],
      [50, -25],
    ],
    endBinding: { elementId: b.id },
  })
  expect(scene.bindTarget).toBe(b)
})
