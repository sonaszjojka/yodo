// Sticky notes (roadmap 2.4, ADR 0038): placing, editing and styling.
import { describe, expect, test } from 'vitest'
import {
  BUILT_IN_STYLE,
  createDocument,
  createNote,
  createShape,
  NOTE_COLOR,
  NOTE_SIZE,
} from '../document/create.ts'
import type { NoteElement } from '../document/types.ts'
import { hitTest } from '../geometry/hit.ts'
import { estimateMeasure } from '../text/layout.ts'
import { createEditor } from './editor.ts'
import { applyStyle, commonStyle, stylesOf } from './style.ts'

function setup() {
  const editor = createEditor(createDocument())
  editor.setTool('note')
  return editor
}

function note(): NoteElement {
  return createNote({ x: 0, y: 0, width: 200, height: 200 })
}

describe('createNote', () => {
  test('is Sand and solid whatever the default fill is', () => {
    const made = createNote({ x: 0, y: 0, width: 10, height: 10 }, 1, {
      ...BUILT_IN_STYLE,
      backgroundColor: 'transparent',
      roughness: 2,
    })

    expect(made).toMatchObject({
      type: 'note',
      backgroundColor: NOTE_COLOR,
      fillStyle: 'solid',
      strokeWidth: 0,
      roughness: 0,
    })
  })
})

describe('the note tool', () => {
  test('a click places a default-size note centred on the click and opens its text', () => {
    const editor = setup()

    editor.pointerDown(1, [100, 100], { button: 0, shift: false })
    editor.pointerUp(1)

    const { document, tool, editing, selectedIds } = editor.store.getState()
    expect(document.elements).toHaveLength(1)
    expect(document.elements[0]).toMatchObject({
      type: 'note',
      x: 100 - NOTE_SIZE / 2,
      y: 100 - NOTE_SIZE / 2,
      width: NOTE_SIZE,
      height: NOTE_SIZE,
    })
    expect(tool).toBe('select')
    expect(editing).toMatchObject({
      target: 'label',
      id: document.elements[0]!.id,
    })
    expect(selectedIds).toEqual([])
  })

  test('a drag sizes the note', () => {
    const editor = setup()

    editor.pointerDown(1, [10, 20], { button: 0, shift: false })
    editor.pointerMove(1, [110, 80], false)
    editor.pointerUp(1)

    expect(editor.store.getState().document.elements[0]).toMatchObject({
      type: 'note',
      x: 10,
      y: 20,
      width: 100,
      height: 60,
    })
  })

  test('typing and committing sets the label and selects the note', () => {
    const editor = setup()
    editor.pointerDown(1, [100, 100], { button: 0, shift: false })
    editor.pointerUp(1)

    editor.setEditingText('Buy milk')
    editor.commitText()

    const { document, selectedIds, editing } = editor.store.getState()
    const placed = document.elements[0] as NoteElement
    expect(placed.label?.text).toBe('Buy milk')
    expect(selectedIds).toEqual([placed.id])
    expect(editing).toBeNull()
  })

  test('committing blank text keeps the note, without a label', () => {
    const editor = setup()
    editor.pointerDown(1, [100, 100], { button: 0, shift: false })
    editor.pointerUp(1)

    editor.commitText()

    const placed = editor.store.getState().document.elements[0] as NoteElement
    expect(placed.type).toBe('note')
    expect(placed.label).toBeUndefined()
  })

  test('one undo removes a note placed and left empty', () => {
    const editor = setup()
    editor.pointerDown(1, [100, 100], { button: 0, shift: false })
    editor.pointerUp(1)
    editor.commitText()

    editor.undo()

    expect(editor.store.getState().document.elements).toEqual([])
  })

  test('double-clicking a note edits its text', () => {
    const editor = setup()
    editor.pointerDown(1, [100, 100], { button: 0, shift: false })
    editor.pointerUp(1)
    editor.setEditingText('Hi')
    editor.commitText()

    editor.doubleClick([100, 100])

    expect(editor.store.getState().editing).toMatchObject({
      target: 'label',
      text: 'Hi',
    })
  })
})

describe('note hit-testing', () => {
  test('hits anywhere inside, not only near the edge', () => {
    expect(hitTest(note(), [100, 100], 4)).toBe(true)
    expect(hitTest(note(), [300, 100], 4)).toBe(false)
  })
})

describe('note styles', () => {
  const doc = (...elements: NoteElement[]) => ({
    ...createDocument(),
    elements,
  })

  test('offers text colour, note colour and opacity only', () => {
    expect(stylesOf(note())).toEqual([
      'strokeColor',
      'backgroundColor',
      'opacity',
    ])
  })

  test('changes the note colour', () => {
    const target = note()

    const next = applyStyle(
      doc(target),
      [target.id],
      { backgroundColor: '#E0E9FB' },
      estimateMeasure,
    )

    expect(next.elements[0]).toMatchObject({ backgroundColor: '#E0E9FB' })
  })

  test('refuses a transparent colour, such as one pasted from an unfilled shape', () => {
    const target = note()
    const rect = createShape('rectangle', { x: 0, y: 0, width: 5, height: 5 })
    const document = { ...createDocument(), elements: [target, rect] }

    const next = applyStyle(
      document,
      [target.id, rect.id],
      { backgroundColor: 'transparent', strokeColor: '#C2453D' },
      estimateMeasure,
    )

    expect(next.elements[0]).toMatchObject({
      backgroundColor: NOTE_COLOR,
      strokeColor: '#C2453D',
    })
    expect(next.elements[1]).toMatchObject({ backgroundColor: 'transparent' })
  })

  test('a transparent patch alone is no change and no undo step', () => {
    const target = note()
    const document = doc(target)

    expect(
      applyStyle(
        document,
        [target.id],
        { backgroundColor: 'transparent' },
        estimateMeasure,
      ),
    ).toBe(document)
  })

  test('a mixed selection reports the note colour as mixed', () => {
    const rect = createShape('rectangle', { x: 0, y: 0, width: 5, height: 5 })

    expect(commonStyle([note(), rect]).backgroundColor).toBe('mixed')
  })
})
