import { describe, expect, test } from 'vitest'
import { createDocument, createShape } from '../document/create.ts'
import { MAX_ZOOM, MIN_ZOOM } from '../geometry/viewport.ts'
import { createEditor, type Tool } from './editor.ts'

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

test.each(['rectangle', 'diamond', 'ellipse', 'line', 'arrow'] as const)(
  'the router draws with the %s tool',
  (tool) => {
    const editor = setupWith(tool)

    drag(editor, [0, 0], [30, 40])

    expect(editor.store.getState().document.elements).toEqual([
      expect.objectContaining({ type: tool }),
    ])
  },
)

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
