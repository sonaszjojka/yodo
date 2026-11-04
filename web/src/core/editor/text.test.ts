// Text editing in the editor (ADR 0026, 0027): placing, editing and labelling.
import { describe, expect, test } from 'vitest'
import {
  BUILT_IN_STYLE,
  createDocument,
  createLinear,
  createShape,
  createText,
} from '../document/create.ts'
import type { Point, TextElement, YodoElement } from '../document/types.ts'
import { lineFromDrag } from '../geometry/line.ts'
import {
  estimateMeasure,
  heightForLabel,
  labelBox,
  LINE_HEIGHT,
} from '../text/layout.ts'
import { createEditor, type Editor } from './editor.ts'
import { editBox } from './text.ts'

function setup(elements: YodoElement[] = []) {
  return createEditor({ ...createDocument(), elements })
}

const MONO_DEFAULTS = {
  ...BUILT_IN_STYLE,
  strokeColor: '#C2453D',
  fontFamily: 'mono',
  fontSize: 28,
  textAlign: 'right',
} as const

/** A primary-button press and release at a screen point (identity viewport). */
function click(editor: Editor, point: Point) {
  editor.pointerDown(1, point, { button: 0, shift: false })
  editor.pointerUp(1)
}

function type(editor: Editor, text: string) {
  editor.setEditingText(text)
}

const state = (editor: Editor) => editor.store.getState()
const elements = (editor: Editor) => state(editor).document.elements

/** estimateMeasure at the default 20 px: 11 px per character. */
const CHAR = estimateMeasure('a', '20px x')
const LINE = 20 * LINE_HEIGHT

describe('the text tool', () => {
  test('a click starts a new text with its first line centred on the click', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [100, 100])

    const { editing } = state(editor)
    expect(editing?.target).toBe('new')
    expect(editing?.text).toBe('')
    expect(editing?.target === 'new' && editing.element).toMatchObject({
      x: 100,
      y: 100 - LINE / 2,
    })
    expect(elements(editor)).toEqual([])
  })

  test('committing adds one text sized to its lines, selects it, and is one undo step', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [100, 100])
    type(editor, 'Hi\nthere')
    editor.commitText()

    const [text] = elements(editor) as [TextElement]
    expect(text).toMatchObject({
      type: 'text',
      text: 'Hi\nthere',
      x: 100,
      width: 5 * CHAR,
      height: 2 * LINE,
    })
    expect(state(editor)).toMatchObject({
      editing: null,
      tool: 'select',
      selectedIds: [text.id],
    })

    editor.undo()
    expect(elements(editor)).toEqual([])
  })

  test('typing alone is not a document change', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [0, 0])
    const before = state(editor).document
    type(editor, 'abc')
    expect(state(editor).document).toBe(before)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('an empty or blank text is dropped on commit', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [0, 0])
    type(editor, '  \n ')
    editor.commitText()

    expect(elements(editor)).toEqual([])
    expect(state(editor).editing).toBeNull()
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('a click on an existing text edits it', () => {
    const text = {
      ...createText([0, 0], 1),
      text: 'old',
      width: 33,
      height: 25,
    }
    const editor = setup([text])
    editor.setTool('text')
    click(editor, [10, 10])

    expect(state(editor).editing).toEqual({
      target: 'text',
      id: text.id,
      text: 'old',
    })
  })

  test('a click inside a transparent shape edits its label', () => {
    const rect = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = setup([rect])
    editor.setTool('text')
    click(editor, [100, 50])

    expect(state(editor).editing).toEqual({
      target: 'label',
      id: rect.id,
      text: '',
    })
  })

  test('a press on the canvas while editing commits and does nothing else', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [0, 0])
    type(editor, 'one')
    click(editor, [300, 300])

    expect(elements(editor)).toHaveLength(1)
    expect(state(editor).editing).toBeNull()
  })
})

describe('double-click with the select tool', () => {
  test('on a text edits it, and committing updates its text and size', () => {
    const text = {
      ...createText([0, 0], 1),
      text: 'old',
      width: 33,
      height: 25,
    }
    const editor = setup([text])
    editor.doubleClick([5, 5])
    expect(state(editor).editing).toMatchObject({ target: 'text', id: text.id })

    type(editor, 'longer')
    editor.commitText()
    expect(elements(editor)[0]).toMatchObject({
      id: text.id,
      text: 'longer',
      width: 6 * CHAR,
    })
    expect(state(editor).selectedIds).toEqual([text.id])
  })

  test('the edited text is unchanged until commit, and unchanged text is no change', () => {
    const text = {
      ...createText([0, 0], 1),
      text: 'same',
      width: 44,
      height: 25,
    }
    const editor = setup([text])
    editor.doubleClick([5, 5])
    editor.commitText()

    expect(elements(editor)[0]).toBe(text)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('clearing an existing text deletes it', () => {
    const text = {
      ...createText([0, 0], 1),
      text: 'bye',
      width: 33,
      height: 25,
    }
    const editor = setup([text])
    editor.doubleClick([5, 5])
    type(editor, '')
    editor.commitText()

    expect(elements(editor)).toEqual([])
    expect(state(editor).selectedIds).toEqual([])
  })

  test('on a shape edits its label, and committing adds it', () => {
    const rect = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = setup([rect])
    editor.doubleClick([100, 50])
    type(editor, 'Box')
    editor.commitText()

    expect(elements(editor)[0]).toMatchObject({
      id: rect.id,
      height: 100,
      label: { text: 'Box', fontFamily: 'hand', textAlign: 'center' },
    })
    expect(state(editor).selectedIds).toEqual([rect.id])
  })

  test('a shape grows taller when its label does not fit', () => {
    const rect = createShape('rectangle', {
      x: 0,
      y: 10,
      width: 200,
      height: 30,
    })
    const editor = setup([rect])
    editor.doubleClick([100, 25])
    type(editor, 'a\nb\nc')
    editor.commitText()

    expect(elements(editor)[0]).toMatchObject({
      y: 10,
      height: heightForLabel('rectangle', 3 * LINE),
    })
  })

  test('clearing a label removes the field', () => {
    const rect = {
      ...createShape('rectangle', { x: 0, y: 0, width: 200, height: 100 }),
      label: {
        text: 'x',
        fontFamily: 'hand',
        fontSize: 20,
        textAlign: 'center',
      } as const,
    }
    const editor = setup([rect])
    editor.doubleClick([100, 50])
    expect(state(editor).editing?.text).toBe('x')
    type(editor, '')
    editor.commitText()

    expect(elements(editor)[0]).not.toHaveProperty('label')
  })

  test('on empty space starts a new text there', () => {
    const editor = setup()
    editor.doubleClick([40, 40])
    expect(state(editor).editing?.target).toBe('new')
  })

  test('on a line does nothing', () => {
    const line = createLinear('line', lineFromDrag([0, 0], [100, 0], false))
    const editor = setup([line])
    editor.doubleClick([50, 0])
    expect(state(editor).editing).toBeNull()
  })

  test('maps the screen point through the viewport', () => {
    const text = {
      ...createText([100, 100], 1),
      text: 'z',
      width: 11,
      height: 25,
    }
    const editor = setup([text])
    editor.setZoom(2, [0, 0])
    editor.doubleClick([205, 205])
    expect(state(editor).editing).toMatchObject({ target: 'text' })
  })
})

describe('editing and the rest of the editor', () => {
  test('starting an edit clears the selection', () => {
    const rect = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = setup([rect])
    click(editor, [0, 50])
    expect(state(editor).selectedIds).toEqual([rect.id])
    editor.doubleClick([100, 50])
    expect(state(editor).selectedIds).toEqual([])
  })

  test('undo while editing commits first, then undoes that commit', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [0, 0])
    type(editor, 'draft')
    editor.undo()

    expect(state(editor).editing).toBeNull()
    expect(elements(editor)).toEqual([])
    editor.redo()
    expect(elements(editor)).toMatchObject([{ text: 'draft' }])
  })

  test('changing tool while editing commits', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [0, 0])
    type(editor, 'kept')
    editor.setTool('rectangle')

    expect(elements(editor)).toMatchObject([{ text: 'kept' }])
    expect(state(editor)).toMatchObject({ editing: null, tool: 'rectangle' })
  })

  test('commit with nothing being edited does nothing', () => {
    const editor = setup()
    const before = state(editor)
    editor.commitText()
    expect(state(editor)).toBe(before)
  })

  test('uses the measure it is given', () => {
    const editor = createEditor(createDocument(), { measure: () => 7 })
    editor.setTool('text')
    click(editor, [0, 0])
    type(editor, 'anything')
    editor.commitText()
    expect(elements(editor)[0]).toMatchObject({ width: 7 })
  })
})

describe('editBox', () => {
  test('a new text grows with what is typed and does not wrap', () => {
    const editor = setup()
    editor.setTool('text')
    click(editor, [100, 100])
    type(editor, 'abc\nde')
    const { document, editing } = state(editor)

    expect(editBox(document, editing!, estimateMeasure)).toMatchObject({
      x: 100,
      y: 100 - LINE / 2,
      width: 3 * CHAR,
      height: 2 * LINE,
      fontFamily: 'hand',
      textAlign: 'left',
      wraps: false,
    })
  })

  test('a label fills its label box width and is centred vertically', () => {
    const rect = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = setup([rect])
    editor.doubleClick([100, 50])
    type(editor, 'x')
    const { document, editing } = state(editor)

    const box = labelBox(rect)
    expect(editBox(document, editing!, estimateMeasure)).toMatchObject({
      x: box.x,
      width: box.width,
      y: 50 - LINE / 2,
      height: LINE,
      textAlign: 'center',
      wraps: true,
    })
  })

  test('is null when the edited element is gone', () => {
    expect(
      editBox(
        createDocument(),
        { target: 'text', id: 'gone', text: '' },
        estimateMeasure,
      ),
    ).toBeNull()
  })
})

describe('review fixes', () => {
  test('text under a later transparent shape is still edited, not the shape label', () => {
    const text = {
      ...createText([50, 40], 1),
      text: 'Hello',
      width: 55,
      height: 25,
    }
    const rect = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = setup([text, rect])
    editor.doubleClick([60, 50])
    expect(state(editor).editing).toMatchObject({
      target: 'text',
      id: text.id,
    })
  })

  test('a selected arrow whose box covers a shape does not block editing its label', () => {
    const arrow = createLinear('arrow', lineFromDrag([0, 0], [300, 300], false))
    const rect = createShape('rectangle', {
      x: 150,
      y: 0,
      width: 100,
      height: 60,
    })
    const editor = setup([rect, arrow])
    click(editor, [100, 100])
    expect(state(editor).selectedIds).toEqual([arrow.id])

    editor.doubleClick([200, 30])
    expect(state(editor).editing).toMatchObject({
      target: 'label',
      id: rect.id,
    })
  })

  test('a tiny shape wraps its label at a minimum width, not per character', () => {
    const diamond = createShape('diamond', {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    })
    const editor = setup([diamond])
    editor.doubleClick([10, 10])
    type(editor, 'Hello')
    const { document, editing } = state(editor)
    expect(editBox(document, editing!, estimateMeasure)!.width).toBeGreaterThan(
      5 * CHAR,
    )
    editor.commitText()

    // One line, so the diamond grows only to fit one line.
    expect(elements(editor)[0]).toMatchObject({
      height: heightForLabel('diamond', LINE),
    })
  })
})

describe('defaults for new text (ADR 0036)', () => {
  test('a new text takes the default colour, font, size and alignment', () => {
    const editor = createEditor(createDocument(), { defaults: MONO_DEFAULTS })
    editor.setTool('text')
    click(editor, [100, 100])
    type(editor, 'Hi')
    editor.commitText()

    expect(elements(editor)[0]).toMatchObject({
      strokeColor: '#C2453D',
      fontFamily: 'mono',
      fontSize: 28,
      textAlign: 'right',
    })
  })

  test('a new label takes the default font and size, centred', () => {
    const shape = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = createEditor(
      { ...createDocument(), elements: [shape] },
      { defaults: MONO_DEFAULTS },
    )
    editor.doubleClick([100, 50])
    type(editor, 'Label')
    editor.commitText()

    expect((elements(editor)[0] as typeof shape).label).toEqual({
      text: 'Label',
      fontFamily: 'mono',
      fontSize: 28,
      textAlign: 'center',
    })
  })

  test('the textarea of a new label shows the default font and size', () => {
    const shape = createShape('rectangle', {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    const editor = createEditor(
      { ...createDocument(), elements: [shape] },
      { defaults: MONO_DEFAULTS },
    )
    editor.doubleClick([100, 50])
    const { document, editing } = state(editor)

    expect(
      editBox(document, editing!, estimateMeasure, MONO_DEFAULTS),
    ).toMatchObject({ fontFamily: 'mono', fontSize: 28, textAlign: 'center' })
  })
})
