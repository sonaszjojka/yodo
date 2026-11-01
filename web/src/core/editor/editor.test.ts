import { expect, test } from 'vitest'
import { createDocument } from '../document/create.ts'
import { MAX_ZOOM, MIN_ZOOM } from '../geometry/viewport.ts'
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

// Input router: screen points, routed to drawing or panning.

const primary = { button: 0, shift: false }

function drag(
  editor: ReturnType<typeof setup>,
  from: [number, number],
  to: [number, number],
  button = 0,
) {
  editor.pointerDown(1, from, { button, shift: false })
  editor.pointerMove(1, to, false)
  editor.pointerUp(1)
}

test('the viewport starts from the document and defaults to the rectangle tool', () => {
  const document = {
    ...createDocument(),
    appState: { viewport: { x: 5, y: 6, zoom: 2 } },
  }
  const { store } = createEditor(document)

  expect(store.getState()).toMatchObject({
    viewport: { x: 5, y: 6, zoom: 2 },
    tool: 'rectangle',
    spaceHeld: false,
    panning: false,
  })
})

test.each([
  [0, MIN_ZOOM],
  [-2, MIN_ZOOM],
  [500, MAX_ZOOM],
])('a stored zoom of %d starts clamped to %d', (stored, expected) => {
  const document = {
    ...createDocument(),
    appState: { viewport: { x: 5, y: 6, zoom: stored } },
  }
  const { store } = createEditor(document)

  expect(store.getState().viewport).toEqual({ x: 5, y: 6, zoom: expected })
})

test('a drag while panned and zoomed draws at world coordinates', () => {
  const editor = setup()
  editor.panBy(-100, -50) // world (100, 50) is now at the top-left at zoom 1
  editor.setZoom(2, [0, 0])

  drag(editor, [20, 40], [60, 80])

  expect(editor.store.getState().document.elements[0]).toMatchObject({
    x: 110,
    y: 70,
    width: 20,
    height: 20,
  })
})

test('a hand-tool drag pans and draws nothing', () => {
  const editor = setup()
  editor.setTool('hand')

  drag(editor, [100, 100], [130, 90])

  const { viewport, document } = editor.store.getState()
  expect(viewport).toEqual({ x: -30, y: 10, zoom: 1 })
  expect(document.elements).toEqual([])
})

test('holding Space pans from the rectangle tool', () => {
  const editor = setup()
  editor.setSpaceHeld(true)

  drag(editor, [0, 0], [10, 20])

  expect(editor.store.getState().viewport).toMatchObject({ x: -10, y: -20 })
  expect(editor.store.getState().document.elements).toEqual([])
})

test('a middle-button drag pans', () => {
  const editor = setup()

  drag(editor, [0, 0], [10, 0], 1)

  expect(editor.store.getState().viewport.x).toBe(-10)
  expect(editor.store.getState().document.elements).toEqual([])
})

test('other buttons do nothing', () => {
  const editor = setup()
  const before = editor.store.getState()

  drag(editor, [0, 0], [10, 10], 2)

  expect(editor.store.getState()).toBe(before)
})

test('panning is flagged only while the pan drag lasts', () => {
  const editor = setup()
  editor.setTool('hand')

  editor.pointerDown(1, [0, 0], primary)
  expect(editor.store.getState().panning).toBe(true)
  // Releasing Space mid-pan doesn't stop the pan; only the pointer does.
  editor.setSpaceHeld(false)
  editor.pointerMove(1, [5, 5], false)
  expect(editor.store.getState().viewport.x).toBe(-5)
  editor.pointerUp(1)
  expect(editor.store.getState().panning).toBe(false)
})

test('cancel ends a pan, and a second pointer cannot steer it', () => {
  const editor = setup()
  editor.setTool('hand')

  editor.pointerDown(1, [0, 0], primary)
  editor.pointerMove(2, [50, 50], false)
  expect(editor.store.getState().viewport.x).toBe(0)

  editor.cancel()
  editor.pointerMove(1, [50, 50], false)
  expect(editor.store.getState()).toMatchObject({
    panning: false,
    viewport: { x: 0, y: 0 },
  })
})

test('a pointer cancel ends a pan', () => {
  const editor = setup()
  editor.setTool('hand')

  editor.pointerDown(1, [0, 0], primary)
  editor.pointerCancel(1)

  expect(editor.store.getState().panning).toBe(false)
})

test('zoomAt and setZoom clamp the zoom', () => {
  const editor = setup()

  editor.zoomAt([0, 0], 1000)
  expect(editor.store.getState().viewport.zoom).toBe(30)

  editor.setZoom(0, [0, 0])
  expect(editor.store.getState().viewport.zoom).toBe(0.1)
})

test('zoomAt keeps the point under the cursor', () => {
  const editor = setup()

  editor.zoomAt([200, 100], 2)

  expect(editor.store.getState().viewport).toEqual({ x: 100, y: 50, zoom: 2 })
})

test('viewport changes leave the document untouched', () => {
  const editor = setup()
  const { document } = editor.store.getState()

  editor.panBy(10, 10)
  editor.zoomAt([5, 5], 2)
  editor.setTool('hand')
  drag(editor, [0, 0], [10, 10])

  expect(editor.store.getState().document).toBe(document)
})

test('setTool and setSpaceHeld skip no-op updates', () => {
  const editor = setup()
  const before = editor.store.getState()

  editor.setTool('rectangle')
  editor.setSpaceHeld(false)

  expect(editor.store.getState()).toBe(before)
})

test('a rectangle drag in progress keeps the router on drawing', () => {
  const editor = setup()

  editor.pointerDown(1, [0, 0], primary)
  editor.setSpaceHeld(true)
  editor.pointerMove(1, [30, 30], false)
  editor.pointerUp(1)

  expect(editor.store.getState().document.elements).toHaveLength(1)
  expect(editor.store.getState().viewport.x).toBe(0)
})

test('Shift through the router squares the rectangle', () => {
  const editor = setup()

  editor.pointerDown(1, [0, 0], primary)
  editor.pointerMove(1, [30, 50], false)
  editor.setShift(true)
  editor.pointerUp(1)

  expect(editor.store.getState().document.elements[0]).toMatchObject({
    width: 50,
    height: 50,
  })
})
