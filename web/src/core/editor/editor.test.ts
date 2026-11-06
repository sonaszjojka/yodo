import { describe, expect, test } from 'vitest'
import {
  BUILT_IN_STYLE,
  createDocument,
  createLinear,
  createShape,
} from '../document/create.ts'
import { lineFromDrag } from '../geometry/line.ts'
import { MAX_ZOOM, MIN_ZOOM } from '../geometry/viewport.ts'
import type { ArrowElement } from '../document/types.ts'
import { createEditor, type Tool } from './editor.ts'
import { sceneOf } from './scene.ts'

/** An editor on an empty drawing with the rectangle tool active. */
function setup() {
  const editor = createEditor(createDocument())
  editor.setTool('rectangle')
  return editor
}

test('a drag commits one rectangle with the dragged bounds', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [10, 20], false)
  drawTool.pointerMove(1, [40, 60], false)
  drawTool.pointerUp(1)

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
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [10, 10], false)
  const first = store.getState().draft!
  drawTool.pointerMove(1, [50, 80], false)
  const second = store.getState().draft!
  drawTool.pointerUp(1)

  expect(second.width).toBe(50)
  expect(second.seed).toBe(first.seed)
  expect(second.id).toBe(first.id)
  expect(store.getState().document.elements[0]!.seed).toBe(first.seed)
})

test('Shift keeps the rectangle square', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [0, 0], true)
  drawTool.pointerMove(1, [30, 50], true)
  drawTool.pointerUp(1)

  const rect = store.getState().document.elements[0]!
  expect(rect.width).toBe(50)
  expect(rect.height).toBe(50)
})

test('pressing and releasing Shift mid-drag updates the draft without a move', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [30, 50], false)

  drawTool.setShift(true)
  expect(store.getState().draft).toMatchObject({ width: 50, height: 50 })

  drawTool.setShift(false)
  expect(store.getState().draft).toMatchObject({ width: 30, height: 50 })
})

test('setShift without a drag changes nothing', () => {
  const { store, drawTool } = setup()
  const before = store.getState()

  drawTool.setShift(true)

  expect(store.getState()).toBe(before)
})

test('a click without a drag adds nothing', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [10, 10], false)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements).toEqual([])
  expect(store.getState().draft).toBeNull()
})

test('a drag along one axis only adds nothing', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [10, 10], false)
  drawTool.pointerMove(1, [60, 10], false)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements).toEqual([])
})

test('cancel drops the draft', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [30, 30], false)
  drawTool.cancel()
  drawTool.pointerUp(1)

  expect(store.getState().draft).toBeNull()
  expect(store.getState().document.elements).toEqual([])
})

test('moves after the drag ended are ignored', () => {
  const { store, drawTool } = setup()

  drawTool.pointerMove(1, [30, 30], false)

  expect(store.getState().draft).toBeNull()
})

test('a second pointer cannot restart, reshape or end the drag', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [30, 40], false)
  // A second finger touches, moves and lifts mid-drag.
  drawTool.pointerDown(2, [100, 100], false)
  drawTool.pointerMove(2, [200, 200], false)
  drawTool.pointerUp(2)
  drawTool.pointerCancel(2)

  expect(store.getState().document.elements).toHaveLength(0)
  expect(store.getState().draft).toMatchObject({
    x: 0,
    y: 0,
    width: 30,
    height: 40,
  })

  drawTool.pointerUp(1)
  expect(store.getState().document.elements).toHaveLength(1)
})

test('a cancelled pointer drops the draft', () => {
  const { store, drawTool } = setup()

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [30, 30], false)
  drawTool.pointerCancel(1)
  drawTool.pointerUp(1)

  expect(store.getState().draft).toBeNull()
  expect(store.getState().document.elements).toHaveLength(0)
})

// Other tools: the active tool picks the element type at pointer down.

function setupWith(tool: Tool) {
  const editor = setup()
  editor.setTool(tool)
  return editor
}

test.each(['diamond', 'ellipse'] as const)(
  'the %s tool commits a %s with the dragged bounds',
  (tool) => {
    const { store, drawTool } = setupWith(tool)

    drawTool.pointerDown(1, [40, 60], false)
    drawTool.pointerMove(1, [10, 20], false)
    drawTool.pointerUp(1)

    expect(store.getState().document.elements).toEqual([
      expect.objectContaining({
        type: tool,
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      }),
    ])
  },
)

test.each(['diamond', 'ellipse'] as const)(
  'Shift keeps the %s proportions equal',
  (tool) => {
    const { store, drawTool } = setupWith(tool)

    drawTool.pointerDown(1, [0, 0], true)
    drawTool.pointerMove(1, [30, 50], true)
    drawTool.pointerUp(1)

    expect(store.getState().document.elements[0]).toMatchObject({
      width: 50,
      height: 50,
    })
  },
)

test.each(['line', 'arrow'] as const)(
  'the %s tool commits from the start point to the cursor',
  (tool) => {
    const { store, drawTool } = setupWith(tool)

    drawTool.pointerDown(1, [40, 60], false)
    drawTool.pointerMove(1, [10, 20], false)
    drawTool.pointerUp(1)

    const [element] = store.getState().document.elements
    expect(element).toMatchObject({
      type: tool,
      x: 40,
      y: 60,
      width: 30,
      height: 40,
      points: [
        [0, 0],
        [-30, -40],
      ],
    })
  },
)

test('the arrow has an arrowhead at its end', () => {
  const { store, drawTool } = setupWith('arrow')

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [50, 0], false)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements[0]).toMatchObject({
    endArrowhead: 'arrow',
  })
})

test('Shift snaps a line to 15° steps, also mid-drag', () => {
  const { store, drawTool } = setupWith('line')

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [100, 8], false)
  expect(store.getState().draft).toMatchObject({ height: 8 })

  drawTool.setShift(true)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements[0]).toMatchObject({ height: 0 })
})

test('a flat line commits, unlike a flat rectangle', () => {
  const { store, drawTool } = setupWith('line')

  drawTool.pointerDown(1, [0, 0], false)
  drawTool.pointerMove(1, [50, 0], false)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements).toHaveLength(1)
})

test('a click with the line tool adds nothing', () => {
  const { store, drawTool } = setupWith('line')

  drawTool.pointerDown(1, [10, 10], false)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements).toEqual([])
})

test('switching tools mid-drag keeps drawing the original shape', () => {
  const { store, drawTool, setTool } = setupWith('ellipse')

  drawTool.pointerDown(1, [0, 0], false)
  setTool('line')
  drawTool.pointerMove(1, [30, 40], false)
  drawTool.pointerUp(1)

  expect(store.getState().document.elements[0]).toMatchObject({
    type: 'ellipse',
    width: 30,
    height: 40,
  })
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

test('the viewport starts from the document and defaults to the select tool', () => {
  const document = {
    ...createDocument(),
    appState: { viewport: { x: 5, y: 6, zoom: 2 } },
  }
  const { store } = createEditor(document)

  expect(store.getState()).toMatchObject({
    viewport: { x: 5, y: 6, zoom: 2 },
    tool: 'select',
    spaceHeld: false,
    panning: false,
    selectedIds: [],
    move: null,
    marquee: null,
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

test.each([
  'rectangle',
  'diamond',
  'ellipse',
  'line',
  'arrow',
  'pencil',
] as const)('the router draws with the %s tool', (tool) => {
  const editor = setupWith(tool)

  drag(editor, [0, 0], [30, 40])

  expect(editor.store.getState().document.elements).toEqual([
    expect.objectContaining({ type: tool }),
  ])
})

// Selection: the select tool through the router (zoom 1, so screen = world).

const FILL = '#E0E9FB'

/** Two filled 100×100 squares at (0, 0) and (200, 0), with Select active. */
function setupSelection() {
  const a = {
    ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }),
    backgroundColor: FILL,
  }
  const b = {
    ...createShape('rectangle', { x: 200, y: 0, width: 100, height: 100 }),
    backgroundColor: FILL,
  }
  const editor = createEditor({ ...createDocument(), elements: [a, b] })
  return { editor, a, b }
}

function click(
  editor: ReturnType<typeof setup>,
  at: [number, number],
  shift = false,
) {
  editor.pointerDown(1, at, { button: 0, shift })
  editor.pointerUp(1)
}

describe('select tool', () => {
  test('a click selects the element under the cursor', () => {
    const { editor, a } = setupSelection()
    click(editor, [50, 50])
    expect(editor.store.getState().selectedIds).toEqual([a.id])
  })

  test('a click selects only the new element', () => {
    const { editor, b } = setupSelection()
    click(editor, [50, 50])
    click(editor, [250, 50])
    expect(editor.store.getState().selectedIds).toEqual([b.id])
  })

  test('Shift+click adds to the selection and toggles back off', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [50, 50])
    click(editor, [250, 50], true)
    expect(editor.store.getState().selectedIds).toEqual([a.id, b.id])

    click(editor, [50, 50], true)
    expect(editor.store.getState().selectedIds).toEqual([b.id])
  })

  test('a plain click on one of several selected narrows to it', () => {
    const { editor, a } = setupSelection()
    click(editor, [50, 50])
    click(editor, [250, 50], true)
    click(editor, [50, 50])
    expect(editor.store.getState().selectedIds).toEqual([a.id])
  })

  test('a click on empty space clears the selection', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    click(editor, [500, 500])
    expect(editor.store.getState().selectedIds).toEqual([])
  })

  test('a box drag selects the elements fully inside it', () => {
    const { editor, a } = setupSelection()
    editor.pointerDown(1, [-10, -10], primary)
    editor.pointerMove(1, [150, 150], false)
    expect(editor.store.getState().marquee).toEqual({
      x: -10,
      y: -10,
      width: 160,
      height: 160,
    })
    editor.pointerUp(1)

    expect(editor.store.getState()).toMatchObject({
      selectedIds: [a.id],
      marquee: null,
    })
  })

  test('Shift+box adds to the selection', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [250, 50])
    editor.pointerDown(1, [-10, -10], { button: 0, shift: true })
    editor.pointerMove(1, [150, 150], true)
    editor.pointerUp(1)
    expect(editor.store.getState().selectedIds).toEqual([b.id, a.id])
  })

  test('dragging moves every selected element in one document change', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    click(editor, [250, 50], true)
    const before = editor.store.getState().document

    editor.pointerDown(1, [50, 50], primary)
    editor.pointerMove(1, [60, 75], false)
    // While dragging, only the preview offset changes.
    expect(editor.store.getState().document).toBe(before)
    expect(editor.store.getState().move).toEqual({ dx: 10, dy: 25 })
    editor.pointerUp(1)

    const { document, move } = editor.store.getState()
    expect(move).toBeNull()
    expect(document.elements.map(({ x, y }) => [x, y])).toEqual([
      [10, 25],
      [210, 25],
    ])
  })

  test('dragging an unselected element selects and moves only it', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [50, 50])
    drag(editor, [250, 50], [260, 50])
    const { selectedIds, document } = editor.store.getState()
    expect(selectedIds).toEqual([b.id])
    expect(document.elements).toEqual([a, { ...b, x: 210 }])
  })

  test('a selected transparent shape can be dragged by its middle', () => {
    const shape = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    const editor = createEditor({ ...createDocument(), elements: [shape] })
    click(editor, [0, 50]) // on the outline
    drag(editor, [50, 50], [70, 50])
    expect(editor.store.getState().document.elements[0]!.x).toBe(20)
  })

  test('a move below the drag threshold stays a click', () => {
    const { editor, a } = setupSelection()
    editor.pointerDown(1, [50, 50], primary)
    editor.pointerMove(1, [51, 51], false)
    editor.pointerUp(1)
    const { document, move } = editor.store.getState()
    expect(move).toBeNull()
    expect(document.elements[0]).toBe(a)
  })

  test('the drag threshold is in screen pixels', () => {
    const { editor } = setupSelection()
    editor.setZoom(4, [0, 0])
    // 2 screen px at zoom 4 is 0.5 world units: still a click.
    editor.pointerDown(1, [200, 200], primary)
    editor.pointerMove(1, [202, 200], false)
    expect(editor.store.getState().move).toBeNull()
  })

  test('Escape mid-move puts everything back', () => {
    const { editor, a } = setupSelection()
    editor.pointerDown(1, [50, 50], primary)
    editor.pointerMove(1, [90, 90], false)
    editor.cancel()
    editor.pointerUp(1)
    const { document, move, selectedIds } = editor.store.getState()
    expect(move).toBeNull()
    expect(document.elements[0]).toBe(a)
    expect(selectedIds).toEqual([a.id])
  })

  test('Escape mid-box drops the box and its selection', () => {
    const { editor } = setupSelection()
    editor.pointerDown(1, [-10, -10], primary)
    editor.pointerMove(1, [150, 150], false)
    editor.cancel()
    expect(editor.store.getState()).toMatchObject({
      marquee: null,
      selectedIds: [],
    })
  })

  test('Escape with nothing in progress clears the selection', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.cancel()
    expect(editor.store.getState().selectedIds).toEqual([])
  })

  test('deleteSelected removes the selected elements', () => {
    const { editor, b } = setupSelection()
    click(editor, [50, 50])
    editor.deleteSelected()
    expect(editor.store.getState()).toMatchObject({
      selectedIds: [],
      document: { elements: [b] },
    })
  })

  test('deleteSelected with nothing selected changes nothing', () => {
    const { editor } = setupSelection()
    const before = editor.store.getState()
    editor.deleteSelected()
    expect(editor.store.getState()).toBe(before)
  })

  test('Delete mid-box deletes the elements the box selected', () => {
    const { editor } = setupSelection()
    click(editor, [250, 50])
    editor.pointerDown(1, [-10, -10], { button: 0, shift: true })
    editor.pointerMove(1, [150, 150], true)
    // Shown as selected: b (the base) and a (inside the box).
    editor.deleteSelected()
    editor.pointerUp(1)
    expect(editor.store.getState()).toMatchObject({
      marquee: null,
      selectedIds: [],
      document: { elements: [] },
    })
  })

  test('a jitter below the drag threshold on empty space shows no box', () => {
    const { editor } = setupSelection()
    editor.pointerDown(1, [500, 500], primary)
    editor.pointerMove(1, [501, 501], false)
    expect(editor.store.getState().marquee).toBeNull()
  })

  test('changing tool clears the selection', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.setTool('ellipse')
    expect(editor.store.getState().selectedIds).toEqual([])
  })
})

// Rectangle a (0, 0, 100, 100) has stroke width 2 and roughness 1, so its
// outline is 3 + 4 units out: (-7, -7, 114, 114), with the se handle at (107, 107).
describe('resize', () => {
  function selectA() {
    const setupResult = setupSelection()
    click(setupResult.editor, [50, 50])
    return setupResult
  }

  test('dragging a corner previews, then commits one document change', () => {
    const { editor, b } = selectA()
    const before = editor.store.getState().document

    editor.pointerDown(1, [107, 107], primary)
    editor.pointerMove(1, [157, 207], false)
    expect(editor.store.getState().document).toBe(before)
    expect(editor.store.getState().resize).toEqual({
      handle: 'se',
      anchor: [0, 0],
      sx: 1.5,
      sy: 2,
    })
    editor.pointerUp(1)

    const { document, resize, selectedIds } = editor.store.getState()
    expect(resize).toBeNull()
    expect(document.elements[0]).toMatchObject({ width: 150, height: 200 })
    expect(document.elements[1]).toBe(b)
    expect(selectedIds).toHaveLength(1)
  })

  test('dragging a side resizes instead of moving the element', () => {
    const { editor } = selectA()
    drag(editor, [107, 50], [57, 80])
    expect(editor.store.getState().document.elements[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 50,
      height: 100,
    })
  })

  test('a handle wins over an element lying under it', () => {
    const a = {
      ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }),
      backgroundColor: FILL,
    }
    // Drawn on top and covering a's se handle.
    const c = {
      ...createShape('rectangle', { x: 104, y: 104, width: 50, height: 50 }),
      backgroundColor: FILL,
    }
    const editor = createEditor({ ...createDocument(), elements: [a, c] })
    click(editor, [50, 50])
    drag(editor, [107, 107], [157, 157])
    const { document, selectedIds } = editor.store.getState()
    expect(selectedIds).toEqual([a.id])
    expect(document.elements[0]).toMatchObject({ width: 150, height: 150 })
    expect(document.elements[1]).toBe(c)
  })

  test('resizes a multi-selection as one group', () => {
    const { editor } = selectA()
    click(editor, [250, 50], true)
    // The group box is (0, 0, 300, 100); its outline's right side is at 307.
    drag(editor, [307, 50], [607, 50])
    expect(
      editor.store
        .getState()
        .document.elements.map(({ x, width }) => [x, width]),
    ).toEqual([
      [0, 200],
      [400, 200],
    ])
  })

  test('a press on a handle without a drag changes nothing', () => {
    const { editor, a } = selectA()
    click(editor, [107, 107])
    const { document, resize, selectedIds } = editor.store.getState()
    expect(resize).toBeNull()
    expect(document.elements[0]).toBe(a)
    expect(selectedIds).toEqual([a.id])
  })

  test('Shift keeps proportions and applies mid-drag without a move', () => {
    const { editor } = selectA()
    editor.pointerDown(1, [107, 107], primary)
    editor.pointerMove(1, [157, 117], false)
    expect(editor.store.getState().resize).toMatchObject({ sx: 1.5, sy: 1.1 })
    editor.setShift(true)
    expect(editor.store.getState().resize).toMatchObject({ sx: 1.5, sy: 1.5 })
    editor.setShift(false)
    expect(editor.store.getState().resize).toMatchObject({ sx: 1.5, sy: 1.1 })
  })

  test('Escape mid-resize puts everything back', () => {
    const { editor, a } = selectA()
    editor.pointerDown(1, [107, 107], primary)
    editor.pointerMove(1, [200, 200], false)
    editor.cancel()
    editor.pointerUp(1)
    const { document, resize, selectedIds } = editor.store.getState()
    expect(resize).toBeNull()
    expect(document.elements[0]).toBe(a)
    expect(selectedIds).toEqual([a.id])
  })

  test('Delete mid-resize deletes the selection and drops the preview', () => {
    const { editor, b } = selectA()
    editor.pointerDown(1, [107, 107], primary)
    editor.pointerMove(1, [200, 200], false)
    editor.deleteSelected()
    editor.pointerUp(1)
    expect(editor.store.getState()).toMatchObject({
      resize: null,
      document: { elements: [b] },
    })
  })

  test('hovering a handle of the selection reports it', () => {
    const { editor } = selectA()
    editor.pointerMove(1, [107, 107], false)
    expect(editor.store.getState().hoverHandle).toBe('se')
    editor.pointerMove(1, [50, 107], false)
    expect(editor.store.getState().hoverHandle).toBe('s')
    editor.pointerMove(1, [500, 500], false)
    expect(editor.store.getState().hoverHandle).toBeNull()
  })

  test('without a selection there are no handles to hover', () => {
    const { editor } = setupSelection()
    editor.pointerMove(1, [107, 107], false)
    expect(editor.store.getState().hoverHandle).toBeNull()
  })

  test('a click on a handle selects the element lying under it', () => {
    const a = {
      ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }),
      backgroundColor: FILL,
    }
    const c = {
      ...createShape('rectangle', { x: 104, y: 104, width: 50, height: 50 }),
      backgroundColor: FILL,
    }
    const editor = createEditor({ ...createDocument(), elements: [a, c] })
    click(editor, [50, 50])
    click(editor, [107, 107])
    expect(editor.store.getState().selectedIds).toEqual([c.id])
  })

  test('Shift+click on a group edge in a side zone toggles that element off', () => {
    const { editor, a } = selectA()
    click(editor, [250, 50], true)
    // 4 from b's right edge: b is hit, and the outline's 'e' side (307) is near.
    click(editor, [304, 50], true)
    expect(editor.store.getState().selectedIds).toEqual([a.id])
  })

  test('a flat line moves when pressed beside it, as it has no height to resize', () => {
    const line = createLinear('line', lineFromDrag([0, 0], [100, 0], false))
    const editor = createEditor({ ...createDocument(), elements: [line] })
    click(editor, [50, 0])
    // Within hit tolerance of the line and on the outline's top side.
    editor.pointerMove(1, [50, -5], false)
    expect(editor.store.getState().hoverHandle).toBeNull()
    drag(editor, [50, -5], [50, 15])
    expect(editor.store.getState().document.elements[0]).toMatchObject({
      x: 0,
      y: 20,
    })
  })

  test('the cursor handle follows a flip, and is re-read from the pointer after', () => {
    const { editor } = selectA()
    editor.pointerDown(1, [107, 107], primary)
    editor.pointerMove(1, [-100, 207], false)
    // Dragged past the west side: the pointer now pulls the sw corner.
    expect(editor.store.getState().resize?.handle).toBe('sw')
    editor.pointerUp(1)
    // The new box is (-107, 0, 107, 200): the pointer is on its bottom side.
    expect(editor.store.getState().hoverHandle).toBe('s')
  })

  test('panning or zooming re-reads the handle under the pointer', () => {
    const { editor } = selectA()
    editor.pointerMove(1, [107, 107], false)
    expect(editor.store.getState().hoverHandle).toBe('se')
    editor.panBy(100, 100)
    expect(editor.store.getState().hoverHandle).toBeNull()
    editor.panBy(-100, -100)
    expect(editor.store.getState().hoverHandle).toBe('se')
    editor.zoomAt([0, 0], 2)
    expect(editor.store.getState().hoverHandle).toBeNull()
  })

  test('a pan drag re-reads the handle where the pointer ends up', () => {
    const { editor } = selectA()
    editor.setSpaceHeld(true)
    // Grabbed on the se handle: the content moves with the pointer, so the
    // pointer is still on it, now at (207, 207) on screen.
    editor.pointerDown(1, [107, 107], primary)
    editor.pointerMove(1, [207, 207], false)
    editor.pointerUp(1)
    expect(editor.store.getState().hoverHandle).toBe('se')
  })

  test('a selection change forgets the hovered handle', () => {
    const { editor } = selectA()
    editor.pointerMove(1, [107, 107], false)
    editor.cancel()
    expect(editor.store.getState().hoverHandle).toBeNull()
  })
})

test('drawing selects the new element and switches to Select', () => {
  const editor = setup()
  drag(editor, [0, 0], [30, 40])
  const { tool, selectedIds, document } = editor.store.getState()
  expect(tool).toBe('select')
  expect(selectedIds).toEqual([document.elements[0]!.id])
})

test('changing tool mid-draw still draws the shape but keeps the new tool', () => {
  const editor = setup()
  editor.pointerDown(1, [0, 0], primary)
  editor.pointerMove(1, [30, 40], false)
  editor.setTool('hand')
  editor.pointerUp(1)
  expect(editor.store.getState()).toMatchObject({
    tool: 'hand',
    draft: null,
    selectedIds: [],
    document: { elements: [expect.objectContaining({ type: 'rectangle' })] },
  })
})

test('a click that draws nothing keeps the drawing tool', () => {
  const editor = setup()
  click(editor, [10, 10])
  expect(editor.store.getState()).toMatchObject({
    tool: 'rectangle',
    selectedIds: [],
  })
})

describe('undo and redo', () => {
  test('undo removes a drawn shape and redo brings it back', () => {
    const editor = setup()
    drag(editor, [10, 10], [60, 60])
    const drawn = editor.store.getState().document

    editor.undo()
    expect(editor.store.getState().document.elements).toEqual([])

    editor.redo()
    expect(editor.store.getState().document).toBe(drawn)
  })

  test('undo and redo a move', () => {
    const { editor, a } = setupSelection()
    drag(editor, [50, 50], [80, 90])
    expect(editor.store.getState().document.elements[0]).toMatchObject({
      x: 30,
      y: 40,
    })

    editor.undo()
    expect(editor.store.getState().document.elements[0]).toBe(a)

    editor.redo()
    expect(editor.store.getState().document.elements[0]).toMatchObject({
      x: 30,
      y: 40,
    })
  })

  test('undo and redo a resize', () => {
    const { editor, a } = setupSelection()
    click(editor, [50, 50])
    drag(editor, [107, 107], [157, 207])

    editor.undo()
    expect(editor.store.getState().document.elements[0]).toBe(a)

    editor.redo()
    expect(editor.store.getState().document.elements[0]).toMatchObject({
      width: 150,
      height: 200,
    })
  })

  test('undo brings deleted elements back, redo deletes them again', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [50, 50])
    editor.deleteSelected()

    editor.undo()
    expect(editor.store.getState().document.elements).toEqual([a, b])

    editor.redo()
    expect(editor.store.getState().document.elements).toEqual([b])
  })

  test('a whole drag is one step', () => {
    const { editor, a } = setupSelection()
    editor.pointerDown(1, [50, 50], primary)
    editor.pointerMove(1, [60, 60], false)
    editor.pointerMove(1, [70, 70], false)
    editor.pointerMove(1, [80, 80], false)
    editor.pointerUp(1)

    editor.undo()
    expect(editor.store.getState().document.elements[0]).toBe(a)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('pans, zooms, selection and tool changes are not steps', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.panBy(10, 10)
    editor.zoomAt([0, 0], 2)
    editor.setTool('ellipse')

    expect(editor.history.getState()).toEqual({
      canUndo: false,
      canRedo: false,
    })
  })

  test('a new change after undo clears redo', () => {
    const editor = setup()
    drag(editor, [10, 10], [60, 60])
    editor.undo()
    editor.setTool('rectangle')
    drag(editor, [100, 100], [150, 150])

    expect(editor.history.getState().canRedo).toBe(false)
    const before = editor.store.getState()
    editor.redo()
    expect(editor.store.getState()).toBe(before)
  })

  test('undo with no history changes nothing', () => {
    const editor = setup()
    const before = editor.store.getState()
    editor.undo()
    editor.redo()
    expect(editor.store.getState()).toBe(before)
  })

  test('the selection keeps only elements that exist after the step', () => {
    const editor = setup()
    drag(editor, [10, 10], [60, 60])
    expect(editor.store.getState().selectedIds).toHaveLength(1)

    editor.undo()
    expect(editor.store.getState().selectedIds).toEqual([])
  })

  test('undo during a move drops the drag, and pointer up commits nothing', () => {
    const { editor, a } = setupSelection()
    drag(editor, [50, 50], [80, 80])
    editor.pointerDown(1, [80, 80], primary)
    editor.pointerMove(1, [120, 120], false)

    editor.undo()
    editor.pointerUp(1)

    const { document, move } = editor.store.getState()
    expect(move).toBeNull()
    expect(document.elements[0]).toBe(a)
    expect(editor.history.getState()).toEqual({
      canUndo: false,
      canRedo: true,
    })
  })

  test('undo during a draw drops the shape being drawn', () => {
    const editor = setup()
    drag(editor, [10, 10], [60, 60])
    editor.setTool('rectangle')
    editor.pointerDown(1, [100, 100], primary)
    editor.pointerMove(1, [150, 150], false)

    editor.undo()
    editor.pointerUp(1)

    const { document, draft } = editor.store.getState()
    expect(draft).toBeNull()
    expect(document.elements).toEqual([])
  })
})

describe('pencil tool', () => {
  test('a drag commits one stroke through every sample', () => {
    const { store, drawTool } = setupWith('pencil')

    drawTool.pointerDown(1, [10, 20], false)
    drawTool.pointerMove(1, [20, 25], false)
    drawTool.pointerMove(1, [30, 10], false)
    drawTool.pointerUp(1)

    const { document, draft } = store.getState()
    expect(draft).toBeNull()
    expect(document.elements).toEqual([
      expect.objectContaining({
        type: 'pencil',
        x: 10,
        y: 20,
        width: 20,
        height: 15,
        points: [
          [0, 0],
          [10, 5],
          [20, -10],
        ],
      }),
    ])
  })

  test('the stroke shows as a draft while it is drawn', () => {
    const { store, drawTool } = setupWith('pencil')

    drawTool.pointerDown(1, [0, 0], false)
    drawTool.pointerMove(1, [10, 0], false)

    expect(store.getState().draft).toMatchObject({
      type: 'pencil',
      points: [
        [0, 0],
        [10, 0],
      ],
    })
    expect(store.getState().document.elements).toEqual([])
  })

  test('samples closer than one screen pixel are dropped', () => {
    const editor = setupWith('pencil')
    editor.setZoom(2, [0, 0])

    editor.pointerDown(1, [0, 0], primary)
    editor.pointerMove(1, [4, 0], false)
    // 1.5 screen px on is only 0.75 world units at zoom 2: kept.
    editor.pointerMove(1, [5.5, 0], false)
    // 0.5 screen px on: dropped.
    editor.pointerMove(1, [6, 0], false)
    editor.pointerUp(1)

    expect(editor.store.getState().document.elements[0]).toMatchObject({
      points: [
        [0, 0],
        [2, 0],
        [2.75, 0],
      ],
    })
  })

  test('Shift changes nothing', () => {
    const { store, drawTool } = setupWith('pencil')

    drawTool.pointerDown(1, [0, 0], true)
    drawTool.pointerMove(1, [10, 30], true)
    const before = store.getState()
    drawTool.setShift(false)

    expect(store.getState()).toBe(before)
  })

  test('a click without a drag adds nothing', () => {
    const { store, drawTool } = setupWith('pencil')

    drawTool.pointerDown(1, [5, 5], false)
    drawTool.pointerUp(1)

    expect(store.getState().document.elements).toEqual([])
  })

  test('the pencil stays active with nothing selected, ready for the next stroke', () => {
    const { store, drawTool } = setupWith('pencil')

    drawTool.pointerDown(1, [0, 0], false)
    drawTool.pointerMove(1, [10, 10], false)
    drawTool.pointerUp(1)

    expect(store.getState()).toMatchObject({ tool: 'pencil', selectedIds: [] })
  })

  test('a stroke is one undo step', () => {
    const editor = setupWith('pencil')

    drag(editor, [0, 0], [10, 10])
    editor.pointerDown(1, [20, 20], primary)
    editor.pointerMove(1, [30, 20], false)
    editor.pointerMove(1, [40, 30], false)
    editor.pointerUp(1)
    editor.undo()

    expect(editor.store.getState().document.elements).toHaveLength(1)
  })

  test('a stroke is selected by clicking it and moves as one element', () => {
    const editor = setupWith('pencil')
    editor.pointerDown(1, [0, 0], primary)
    editor.pointerMove(1, [50, 0], false)
    editor.pointerMove(1, [50, 50], false)
    editor.pointerUp(1)
    const [stroke] = editor.store.getState().document.elements
    editor.setTool('select')

    click(editor, [50, 25])
    expect(editor.store.getState().selectedIds).toEqual([stroke!.id])

    drag(editor, [50, 25], [60, 45])
    expect(editor.store.getState().document.elements).toEqual([
      { ...stroke, x: 10, y: 20 },
    ])
  })
})

describe('eraser', () => {
  // Filled boxes, so a press anywhere inside hits them.
  const left = {
    ...createShape('rectangle', { x: 0, y: 0, width: 40, height: 40 }),
    backgroundColor: '#E0E9FB',
  }
  const right = {
    ...createShape('rectangle', { x: 100, y: 0, width: 40, height: 40 }),
    backgroundColor: '#E0E9FB',
  }
  const thin = createLinear('line', lineFromDrag([200, 0], [200, 100], false))
  const hollow = createShape('rectangle', {
    x: 300,
    y: 0,
    width: 100,
    height: 100,
  })

  function eraserOn(elements = [left, right, thin, hollow]) {
    const editor = createEditor({ ...createDocument(), elements })
    editor.setTool('eraser')
    return editor
  }

  function ids(editor: ReturnType<typeof eraserOn>) {
    return editor.store.getState().document.elements.map((e) => e.id)
  }

  const primary = { button: 0, shift: false }

  test('a drag erases everything it passes over, at pointer up', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], primary)
    editor.pointerMove(1, [120, 20], false)
    // Marked, not gone yet: the document changes once.
    expect(editor.store.getState().erasing).toEqual([left.id, right.id])
    expect(ids(editor)).toHaveLength(4)
    editor.pointerUp(1)

    expect(ids(editor)).toEqual([thin.id, hollow.id])
    expect(editor.store.getState().erasing).toBeNull()
  })

  test('one drag is one undo step', () => {
    const editor = eraserOn()
    editor.pointerDown(1, [20, 20], primary)
    editor.pointerMove(1, [60, 20], false)
    editor.pointerMove(1, [120, 20], false)
    editor.pointerUp(1)

    editor.undo()

    expect(ids(editor)).toEqual([left.id, right.id, thin.id, hollow.id])
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('a click erases only the topmost element under it', () => {
    const over = {
      ...createShape('rectangle', { x: 10, y: 10, width: 10, height: 10 }),
      backgroundColor: '#E0E9FB',
    }
    const editor = eraserOn([left, over])

    editor.pointerDown(1, [15, 15], primary)
    editor.pointerUp(1)

    expect(ids(editor)).toEqual([left.id])
  })

  test('a click with a little jitter still erases only the topmost element', () => {
    // `over` is filled and lies across `left`'s right edge at x = 40.
    const over = {
      ...createShape('rectangle', { x: 30, y: 10, width: 20, height: 20 }),
      backgroundColor: '#E0E9FB',
    }
    const editor = eraserOn([left, over])

    editor.pointerDown(1, [40, 20], primary)
    editor.pointerMove(1, [41, 20], false)
    editor.pointerUp(1)

    expect(ids(editor)).toEqual([left.id])
  })

  test('a fast move between two samples still erases a thin line', () => {
    const editor = eraserOn()

    // Both samples are far from the line at x = 200.
    editor.pointerDown(1, [160, 50], primary)
    editor.pointerMove(1, [250, 50], false)
    editor.pointerUp(1)

    expect(ids(editor)).not.toContain(thin.id)
  })

  test('passes through the empty middle of an unfilled shape', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [330, 30], primary)
    editor.pointerMove(1, [370, 70], false)
    editor.pointerUp(1)

    expect(ids(editor)).toContain(hollow.id)
  })

  test('Escape mid-drag erases nothing', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], primary)
    editor.pointerMove(1, [120, 20], false)
    editor.cancel()
    editor.pointerUp(1)

    expect(ids(editor)).toHaveLength(4)
    expect(editor.store.getState().erasing).toBeNull()
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('a cancelled pointer erases nothing', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], primary)
    editor.pointerCancel(1)
    editor.pointerUp(1)

    expect(ids(editor)).toHaveLength(4)
    expect(editor.store.getState().erasing).toBeNull()
  })

  test('changing tool mid-drag erases nothing', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], primary)
    editor.setTool('select')
    editor.pointerUp(1)

    expect(ids(editor)).toHaveLength(4)
    expect(editor.store.getState().erasing).toBeNull()
  })

  test('undo mid-drag drops the marks before going back', () => {
    const editor = eraserOn()
    editor.pointerDown(1, [20, 20], primary)
    editor.pointerUp(1)

    editor.pointerDown(1, [120, 20], primary)
    editor.undo()
    editor.pointerUp(1)

    // The first erase is undone; the second drag was dropped.
    expect(ids(editor)).toEqual([left.id, right.id, thin.id, hollow.id])
    expect(editor.store.getState().erasing).toBeNull()
  })

  test('the eraser stays active after erasing', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], primary)
    editor.pointerUp(1)

    expect(editor.store.getState().tool).toBe('eraser')
  })

  test('a drag over nothing is no document change', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [60, 200], primary)
    editor.pointerMove(1, [90, 220], false)
    editor.pointerUp(1)

    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('only the primary button erases', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], { button: 2, shift: false })
    editor.pointerUp(1)

    expect(ids(editor)).toHaveLength(4)
  })

  test('a second pointer is ignored while erasing', () => {
    const editor = eraserOn()

    editor.pointerDown(1, [20, 20], primary)
    editor.pointerMove(2, [120, 20], false)
    editor.pointerUp(2)
    expect(editor.store.getState().erasing).toEqual([left.id])
    editor.pointerUp(1)

    expect(ids(editor)).toEqual([right.id, thin.id, hollow.id])
  })
})

describe('style', () => {
  test('setStyle changes the selection in one undo step', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [50, 50])

    editor.setStyle({ strokeColor: '#C2453D', strokeWidth: 4 })

    const [first, second] = editor.store.getState().document.elements
    expect(first).toMatchObject({ strokeColor: '#C2453D', strokeWidth: 4 })
    expect(second).toBe(b)
    editor.undo()
    expect(editor.store.getState().document.elements[0]).toBe(a)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('a style the selection already has is no undo step', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])

    editor.setStyle({ strokeWidth: 2 })

    expect(editor.history.getState().canUndo).toBe(false)
  })
})

describe('defaults for new elements (ADR 0036)', () => {
  test('start as the given defaults, or the built-in style', () => {
    const custom = { ...BUILT_IN_STYLE, strokeWidth: 4 }
    expect(createEditor(createDocument()).store.getState().defaults).toBe(
      BUILT_IN_STYLE,
    )
    expect(
      createEditor(createDocument(), { defaults: custom }).store.getState()
        .defaults,
    ).toBe(custom)
  })

  test('setStyle with nothing selected changes the defaults, not the document', () => {
    const { editor } = setupSelection()
    const before = editor.store.getState().document

    editor.setStyle({ strokeColor: '#C2453D', fontSize: 36 })

    const state = editor.store.getState()
    expect(state.document).toBe(before)
    expect(state.defaults).toMatchObject({
      strokeColor: '#C2453D',
      fontSize: 36,
    })
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('setStyle on a selection leaves the defaults alone', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.setStyle({ strokeWidth: 4 })
    expect(editor.store.getState().defaults).toBe(BUILT_IN_STYLE)
  })

  test('a drawn element takes the defaults', () => {
    const editor = setup()
    editor.setStyle({ strokeStyle: 'dashed', opacity: 60, roughness: 0 })
    editor.setTool('rectangle')
    drag(editor, [0, 0], [50, 50])

    expect(editor.store.getState().document.elements[0]).toMatchObject({
      strokeStyle: 'dashed',
      opacity: 60,
      roughness: 0,
    })
  })

  test('setStyle for a selection that has since changed does nothing', () => {
    const { editor, b } = setupSelection()
    click(editor, [50, 50])
    const started = editor.store.getState().selectedIds
    click(editor, [250, 50])
    const before = editor.store.getState()

    editor.setStyle({ strokeWidth: 4 }, { selection: started })
    click(editor, [150, 300])
    editor.setStyle({ strokeWidth: 4 }, { selection: started })

    expect(editor.store.getState().document.elements[1]).toBe(b)
    expect(editor.store.getState().document).toBe(before.document)
    expect(editor.store.getState().defaults).toBe(BUILT_IN_STYLE)
  })

  test('setStyle for the current selection applies', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    const started = editor.store.getState().selectedIds

    editor.setStyle({ strokeWidth: 4 }, { selection: started })

    expect(editor.store.getState().document.elements[0]).toMatchObject({
      strokeWidth: 4,
    })
  })
})

describe('layers (roadmap 2.2b)', () => {
  test('arrange reorders the selection in one undo step', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [50, 50])

    editor.arrange('front')

    expect(editor.store.getState().document.elements).toEqual([b, a])
    expect(editor.store.getState().selectedIds).toEqual([a.id])
    editor.undo()
    expect(editor.store.getState().document.elements).toEqual([a, b])
  })

  test('arrange with nothing to move is no undo step', () => {
    const { editor } = setupSelection()
    click(editor, [250, 50])
    editor.arrange('forward')
    editor.arrange('front')
    expect(editor.history.getState().canUndo).toBe(false)
  })
})

describe('duplicate (roadmap 2.2b)', () => {
  test('duplicateSelected adds offset copies and selects them', () => {
    const { editor, a, b } = setupSelection()
    click(editor, [50, 50])

    editor.duplicateSelected()

    const { document, selectedIds } = editor.store.getState()
    expect(document.elements).toHaveLength(3)
    const copy = document.elements[1]!
    expect(copy).toMatchObject({ x: a.x + 10, y: a.y + 10, seed: a.seed })
    expect(copy.id).not.toBe(a.id)
    expect(document.elements[2]).toBe(b)
    expect(selectedIds).toEqual([copy.id])
    editor.undo()
    expect(editor.store.getState().document.elements).toEqual([a, b])
  })

  test('with nothing selected it does nothing', () => {
    const { editor } = setupSelection()
    editor.duplicateSelected()
    expect(editor.history.getState().canUndo).toBe(false)
  })
})

describe('copy and paste style (roadmap 2.2b)', () => {
  test('copyStyle keeps the shared style; it is no document change', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.setStyle({ strokeColor: '#C2453D', roundness: 'round' })
    const before = editor.store.getState().document

    editor.copyStyle()

    const state = editor.store.getState()
    expect(state.document).toBe(before)
    expect(state.copiedStyle).toMatchObject({
      strokeColor: '#C2453D',
      roundness: 'round',
    })
  })

  test('copyStyle leaves out mixed styles', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.setStyle({ strokeColor: '#C2453D' })
    click(editor, [250, 50], true)

    editor.copyStyle()

    expect(editor.store.getState().copiedStyle).not.toHaveProperty(
      'strokeColor',
    )
  })

  test('copyStyle with nothing shared keeps the earlier copy', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.copyStyle()
    const earlier = editor.store.getState().copiedStyle
    // Two shapes that differ in every style they have.
    editor.store.setState((prev) => ({
      ...prev,
      document: {
        ...prev.document,
        elements: [
          prev.document.elements[0]!,
          {
            ...prev.document.elements[1]!,
            strokeColor: '#C2453D',
            backgroundColor: '#F7E1DE',
            fillStyle: 'solid',
            strokeWidth: 4,
            strokeStyle: 'dashed',
            roughness: 0,
            roundness: 'round',
            opacity: 50,
          },
        ],
      },
    }))
    click(editor, [250, 50], true)

    editor.copyStyle()

    expect(editor.store.getState().copiedStyle).toBe(earlier)
  })

  test('pasteStyle applies the copied style in one undo step', () => {
    const { editor, b } = setupSelection()
    click(editor, [50, 50])
    editor.setStyle({ strokeColor: '#C2453D', strokeWidth: 4 })
    editor.copyStyle()
    click(editor, [250, 50])

    editor.pasteStyle()

    expect(editor.store.getState().document.elements[1]).toMatchObject({
      strokeColor: '#C2453D',
      strokeWidth: 4,
    })
    editor.undo()
    expect(editor.store.getState().document.elements[1]).toBe(b)
  })

  test('pasteStyle with nothing copied or nothing selected does nothing', () => {
    const { editor } = setupSelection()
    click(editor, [50, 50])
    editor.pasteStyle()
    expect(editor.history.getState().canUndo).toBe(false)

    editor.copyStyle()
    click(editor, [150, 300])
    const defaults = editor.store.getState().defaults
    editor.pasteStyle()
    expect(editor.store.getState().defaults).toBe(defaults)
    expect(editor.history.getState().canUndo).toBe(false)
  })
})

describe('use as default (roadmap 2.2b, ADR 0036)', () => {
  test("copies the selection's shared style into the defaults, no undo step", () => {
    const editor = createEditor({
      ...createDocument(),
      elements: [
        {
          ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }),
          backgroundColor: FILL,
          strokeWidth: 4,
          roundness: 'round',
        },
      ],
    })
    click(editor, [50, 50])
    const before = editor.store.getState().document

    editor.useAsDefault()

    const state = editor.store.getState()
    expect(state.defaults).toEqual({
      ...BUILT_IN_STYLE,
      backgroundColor: FILL,
      strokeWidth: 4,
      roundness: 'round',
    })
    expect(state.document).toBe(before)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('with nothing selected the defaults stay as they are', () => {
    const { editor } = setupSelection()
    editor.useAsDefault()
    expect(editor.store.getState().defaults).toBe(BUILT_IN_STYLE)
  })
})

describe('attached arrows', () => {
  /** Squares a and b with an arrow drawn from a's right edge to b's left. */
  function setupArrow() {
    const { editor, a, b } = setupSelection()
    editor.setTool('arrow')
    editor.drawTool.pointerDown(1, [95, 50], false)
    editor.drawTool.pointerMove(1, [206, 50], false)
    editor.drawTool.pointerUp(1)
    const arrow = () =>
      editor.store
        .getState()
        .document.elements.find((e) => e.type === 'arrow') as ArrowElement
    return { editor, a, b, arrow }
  }

  test('an arrow drawn between two shapes binds both ends to their edges', () => {
    const { a, b, arrow } = setupArrow()
    expect(arrow()).toMatchObject({
      x: 100,
      y: 50,
      points: [
        [0, 0],
        [100, 0],
      ],
      startBinding: { elementId: a.id, ratio: [1, 0.5] },
      endBinding: { elementId: b.id, ratio: [0, 0.5] },
    })
  })

  test('an arrow drawn in empty space is not bound', () => {
    const { editor } = setupSelection()
    editor.setTool('arrow')
    editor.drawTool.pointerDown(1, [0, 300], false)
    editor.drawTool.pointerMove(1, [100, 300], false)
    editor.drawTool.pointerUp(1)
    const [, , arrow] = editor.store.getState().document.elements
    expect(arrow).not.toHaveProperty('startBinding')
    expect(arrow).not.toHaveProperty('endBinding')
  })

  test('the end is not bound to the shape the arrow starts on', () => {
    const { editor } = setupSelection()
    editor.setTool('arrow')
    editor.drawTool.pointerDown(1, [50, 50], false)
    editor.drawTool.pointerMove(1, [80, 50], false)
    editor.drawTool.pointerUp(1)
    const [, , arrow] = editor.store.getState().document.elements
    expect(arrow).toHaveProperty('startBinding')
    expect(arrow).not.toHaveProperty('endBinding')
  })

  test('moving a shape drags the arrow end, and one undo reverts both', () => {
    const { editor, b, arrow } = setupArrow()
    const before = editor.store.getState().document
    drag(editor, [250, 50], [250, 150])
    expect(editor.store.getState().document.elements[1]).toMatchObject({
      y: 100,
    })
    expect(arrow()).toMatchObject({
      points: [
        [0, 0],
        [100, 100],
      ],
      endBinding: { elementId: b.id },
    })

    editor.undo()
    expect(editor.store.getState().document).toBe(before)
  })

  test('the canvas shows the arrow following during the drag', () => {
    const { editor } = setupArrow()
    editor.pointerDown(1, [250, 50], { button: 0, shift: false })
    editor.pointerMove(1, [250, 150], false)
    const scene = sceneOf(editor.store.getState())
    expect((scene.elements[2] as ArrowElement).points[1]).toEqual([100, 100])
    editor.pointerUp(1)
  })

  test('resizing a shape keeps the arrow end on its edge', () => {
    const { editor, arrow } = setupArrow()
    click(editor, [250, 50])
    drag(editor, [307, 107], [407, 307])
    const end = arrow().points[1]!
    // b is now 200 wide and 300 tall; the end sits at its left edge middle.
    expect([arrow().x + end[0], arrow().y + end[1]]).toEqual([200, 150])
  })

  test('deleting a shape detaches the arrow and leaves it in place', () => {
    const { editor, a, arrow } = setupArrow()
    const before = arrow()
    click(editor, [250, 50])
    editor.deleteSelected()
    expect(arrow()).not.toHaveProperty('endBinding')
    expect(arrow().points).toEqual(before.points)
    expect(arrow().startBinding?.elementId).toBe(a.id)
  })
})
