import { describe, expect, test } from 'vitest'
import { createDocument, createShape } from '../document/create.ts'
import { createEditor } from './editor.ts'
import { DUPLICATE_OFFSET } from './selection.ts'

const FILL = '#E0E9FB'
const view = { x: 0, y: 0, width: 800, height: 600 }
const primary = { button: 0, shift: false }

function rect(x: number) {
  return {
    ...createShape('rectangle', { x, y: 0, width: 100, height: 100 }),
    backgroundColor: FILL,
  }
}

function setup() {
  const a = rect(0)
  const b = rect(200)
  const editor = createEditor({ ...createDocument(), elements: [a, b] })
  return { editor, a, b }
}

function click(editor: ReturnType<typeof createEditor>, at: [number, number]) {
  editor.pointerDown(1, at, primary)
  editor.pointerUp(1)
}

function elements(editor: ReturnType<typeof createEditor>) {
  return editor.store.getState().document.elements
}

describe('copySelected', () => {
  test('returns the selection as a payload and changes nothing', () => {
    const { editor, a } = setup()
    click(editor, [50, 50])
    const before = editor.store.getState().document

    const text = editor.copySelected()

    expect(JSON.parse(text!).elements).toEqual([a])
    expect(editor.store.getState().document).toBe(before)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('is null with nothing selected', () => {
    expect(setup().editor.copySelected()).toBeNull()
  })
})

describe('cutSelected', () => {
  test('returns the payload and removes the selection as one undo step', () => {
    const { editor, a, b } = setup()
    click(editor, [50, 50])

    const text = editor.cutSelected()

    expect(JSON.parse(text!).elements).toEqual([a])
    expect(elements(editor)).toEqual([b])
    expect(editor.store.getState().selectedIds).toEqual([])
    editor.undo()
    expect(elements(editor)).toEqual([a, b])
  })

  test('with nothing selected it does nothing', () => {
    const { editor } = setup()
    expect(editor.cutSelected()).toBeNull()
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('cut then paste puts the element back where it was', () => {
    const { editor, a } = setup()
    click(editor, [50, 50])
    const text = editor.cutSelected()!

    expect(editor.paste(text, view)).toBe(true)

    const pasted = elements(editor).find((e) => e.seed === a.seed)
    expect(pasted).toMatchObject({ x: a.x, y: a.y, seed: a.seed })
    expect(pasted!.id).not.toBe(a.id)
  })
})

describe('paste', () => {
  test('in the same drawing it lands offset, selected, as one undo step', () => {
    const { editor, a, b } = setup()
    click(editor, [50, 50])
    const text = editor.copySelected()!

    expect(editor.paste(text, view)).toBe(true)

    const { document, selectedIds, tool } = editor.store.getState()
    expect(document.elements).toHaveLength(3)
    expect(document.elements.slice(0, 2)).toEqual([a, b])
    const pasted = document.elements[2]!
    expect(pasted).toMatchObject({
      x: a.x + DUPLICATE_OFFSET,
      y: a.y + DUPLICATE_OFFSET,
    })
    expect(selectedIds).toEqual([pasted.id])
    expect(tool).toBe('select')
    editor.undo()
    expect(elements(editor)).toEqual([a, b])
  })

  test('pasting the same payload again moves one more step', () => {
    const { editor, a } = setup()
    click(editor, [50, 50])
    const text = editor.copySelected()!
    editor.paste(text, view)
    editor.paste(text, view)
    expect(elements(editor)[3]).toMatchObject({
      x: a.x + 2 * DUPLICATE_OFFSET,
    })
  })

  test('in another drawing it lands where it was copied', () => {
    const { editor: source, a } = setup()
    click(source, [50, 50])
    const text = source.copySelected()!
    const target = createEditor(createDocument())

    expect(target.paste(text, view)).toBe(true)

    expect(elements(target)).toEqual([{ ...a, id: expect.any(String) }])
    expect(elements(target)[0]!.id).not.toBe(a.id)
  })

  test('text that is not ours is left alone', () => {
    const { editor } = setup()
    const before = editor.store.getState().document
    expect(editor.paste('hello', view)).toBe(false)
    expect(
      editor.paste('{"type":"yodo/clipboard","version":1,"elements":[]}', view),
    ).toBe(false)
    expect(editor.store.getState().document).toBe(before)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('switches to the select tool', () => {
    const { editor } = setup()
    click(editor, [50, 50])
    const text = editor.copySelected()!
    editor.setTool('rectangle')
    editor.paste(text, view)
    expect(editor.store.getState().tool).toBe('select')
  })
})

describe('selectAll', () => {
  test('selects every element without a document change', () => {
    const { editor, a, b } = setup()
    editor.setTool('rectangle')
    const before = editor.store.getState().document

    editor.selectAll()

    const state = editor.store.getState()
    expect(state.selectedIds).toEqual([a.id, b.id])
    expect(state.tool).toBe('select')
    expect(state.document).toBe(before)
    expect(editor.history.getState().canUndo).toBe(false)
  })

  test('on an empty drawing it changes nothing', () => {
    const editor = createEditor(createDocument())
    const before = editor.store.getState()
    editor.selectAll()
    expect(editor.store.getState()).toBe(before)
  })
})

// A pending drag applies to whatever is selected when the pointer is released
// (review finding 1), so each selection or document edit must end it first.
describe('selection edits during a drag', () => {
  const edits: [string, (editor: ReturnType<typeof createEditor>) => void][] = [
    ['selectAll', (e) => e.selectAll()],
    ['duplicateSelected', (e) => e.duplicateSelected()],
    ['cutSelected', (e) => void e.cutSelected()],
    [
      'paste',
      (e) =>
        void e.paste(
          JSON.stringify({
            type: 'yodo/clipboard',
            version: 1,
            elements: [rect(500)],
          }),
          view,
        ),
    ],
  ]
  const drags: [string, (e: ReturnType<typeof createEditor>) => void][] = [
    [
      'move',
      (e) => {
        e.pointerDown(1, [50, 50], primary)
        e.pointerMove(1, [90, 90], false)
      },
    ],
    [
      'resize',
      (e) => {
        e.pointerDown(1, [107, 107], primary)
        e.pointerMove(1, [157, 207], false)
      },
    ],
    [
      'marquee',
      (e) => {
        e.pointerDown(1, [-50, -50], primary)
        e.pointerMove(1, [350, 150], false)
      },
    ],
  ]

  describe.each(drags)('during a %s drag', (_name, start) => {
    test.each(edits)(
      '%s does not move or resize anything on release',
      (name, edit) => {
        const { editor, a, b } = setup()
        click(editor, [50, 50]) // select a
        start(editor)

        edit(editor)
        editor.pointerUp(1)

        const state = editor.store.getState()
        expect(state.move).toBeNull()
        expect(state.resize).toBeNull()
        expect(state.marquee).toBeNull()
        // Nothing moved or resized: whatever is left is exactly as before. A
        // cut removes what is highlighted, as Delete does.
        const byId = new Map(state.document.elements.map((e) => [e.id, e]))
        const left = [a, b].filter((e) => byId.has(e.id))
        for (const e of left) expect(byId.get(e.id)).toEqual(e)
        if (name === 'cutSelected') expect(byId.has(a.id)).toBe(false)
        else expect(left).toEqual([a, b])
        // A new element (duplicate or paste) sits at its own place, not shifted
        // by the abandoned drag.
        const added = state.document.elements.filter(
          (e) => e.id !== a.id && e.id !== b.id,
        )
        if (name === 'duplicateSelected') {
          // A marquee highlights both rectangles, so both are duplicated.
          for (const e of added) {
            expect([a.x, b.x]).toContain(e.x - DUPLICATE_OFFSET)
          }
          expect(added.length).toBeGreaterThan(0)
        } else if (name === 'paste') {
          expect(added.map((e) => e.x)).toEqual([500])
        } else {
          expect(added).toEqual([])
        }
      },
    )
  })

  test('copySelected during a drag leaves the drag running', () => {
    const { editor } = setup()
    click(editor, [50, 50])
    editor.pointerDown(1, [50, 50], primary)
    editor.pointerMove(1, [90, 90], false)
    editor.copySelected()
    expect(editor.store.getState().move).not.toBeNull()
  })
})
