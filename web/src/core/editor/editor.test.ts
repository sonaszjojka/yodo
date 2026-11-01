import { expect, test } from 'vitest'
import { createDocument } from '../document/create.ts'
import { createEditor } from './editor.ts'

function setup() {
  return createEditor(createDocument())
}

test('a drag commits one rectangle with the dragged bounds', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [10, 20], false)
  rectangleTool.pointerMove(1, [40, 60], false)
  rectangleTool.pointerUp(1)

  const { document, draft } = store.getState()
  expect(draft).toBeNull()
  expect(document.elements).toHaveLength(1)
  expect(document.elements[0]).toMatchObject({
    type: 'rectangle',
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  })
})

test('the draft keeps its id and seed while it is dragged', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [0, 0], false)
  rectangleTool.pointerMove(1, [10, 10], false)
  const first = store.getState().draft!
  rectangleTool.pointerMove(1, [50, 80], false)
  const second = store.getState().draft!
  rectangleTool.pointerUp(1)

  expect(second.width).toBe(50)
  expect(second.seed).toBe(first.seed)
  expect(second.id).toBe(first.id)
  expect(store.getState().document.elements[0]!.seed).toBe(first.seed)
})

test('Shift keeps the rectangle square', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [0, 0], true)
  rectangleTool.pointerMove(1, [30, 50], true)
  rectangleTool.pointerUp(1)

  const rect = store.getState().document.elements[0]!
  expect(rect.width).toBe(50)
  expect(rect.height).toBe(50)
})

test('pressing and releasing Shift mid-drag updates the draft without a move', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [0, 0], false)
  rectangleTool.pointerMove(1, [30, 50], false)

  rectangleTool.setShift(true)
  expect(store.getState().draft).toMatchObject({ width: 50, height: 50 })

  rectangleTool.setShift(false)
  expect(store.getState().draft).toMatchObject({ width: 30, height: 50 })
})

test('setShift without a drag changes nothing', () => {
  const { store, rectangleTool } = setup()
  const before = store.getState()

  rectangleTool.setShift(true)

  expect(store.getState()).toBe(before)
})

test('a click without a drag adds nothing', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [10, 10], false)
  rectangleTool.pointerUp(1)

  expect(store.getState().document.elements).toEqual([])
  expect(store.getState().draft).toBeNull()
})

test('a drag along one axis only adds nothing', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [10, 10], false)
  rectangleTool.pointerMove(1, [60, 10], false)
  rectangleTool.pointerUp(1)

  expect(store.getState().document.elements).toEqual([])
})

test('cancel drops the draft', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [0, 0], false)
  rectangleTool.pointerMove(1, [30, 30], false)
  rectangleTool.cancel()
  rectangleTool.pointerUp(1)

  expect(store.getState().draft).toBeNull()
  expect(store.getState().document.elements).toEqual([])
})

test('moves after the drag ended are ignored', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerMove(1, [30, 30], false)

  expect(store.getState().draft).toBeNull()
})

test('a second pointer cannot restart, reshape or end the drag', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [0, 0], false)
  rectangleTool.pointerMove(1, [30, 40], false)
  // A second finger touches, moves and lifts mid-drag.
  rectangleTool.pointerDown(2, [100, 100], false)
  rectangleTool.pointerMove(2, [200, 200], false)
  rectangleTool.pointerUp(2)
  rectangleTool.pointerCancel(2)

  expect(store.getState().document.elements).toHaveLength(0)
  expect(store.getState().draft).toMatchObject({
    x: 0,
    y: 0,
    width: 30,
    height: 40,
  })

  rectangleTool.pointerUp(1)
  expect(store.getState().document.elements).toHaveLength(1)
})

test('a cancelled pointer drops the draft', () => {
  const { store, rectangleTool } = setup()

  rectangleTool.pointerDown(1, [0, 0], false)
  rectangleTool.pointerMove(1, [30, 30], false)
  rectangleTool.pointerCancel(1)
  rectangleTool.pointerUp(1)

  expect(store.getState().draft).toBeNull()
  expect(store.getState().document.elements).toHaveLength(0)
})
