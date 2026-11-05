import { describe, expect, test, vi } from 'vitest'
import { createDocument, createShape } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import {
  handleClipboardEvent,
  handleEditShortcut,
  isEditable,
  isExportShortcut,
  isInsideDialog,
  type ClipboardLike,
  type ShortcutLike,
} from './editShortcuts.ts'

const view = { x: 0, y: 0, width: 800, height: 600 }

function setup() {
  const a = createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 })
  const editor = createEditor({ ...createDocument(), elements: [a] })
  return { editor, a }
}

function fakeClipboard(
  text = '',
  target: object | null = null,
  files: File[] = [],
) {
  const data = { text }
  let prevented = false
  const event = {
    target: target as EventTarget | null,
    clipboardData: {
      files,
      getData: () => data.text,
      setData: (_type: string, value: string) => void (data.text = value),
    },
    preventDefault: () => void (prevented = true),
  } satisfies ClipboardLike
  return { event, data, prevented: () => prevented }
}

function key(k: string, extra: Partial<ShortcutLike> = {}) {
  let prevented = false
  const event: ShortcutLike = {
    key: k,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: () => void (prevented = true),
    ...extra,
  }
  return { event, prevented: () => prevented }
}

describe('clipboard events', () => {
  test('copy writes the payload and prevents the default', () => {
    const { editor, a } = setup()
    editor.selectAll()
    const c = fakeClipboard()
    handleClipboardEvent(editor, 'copy', c.event, view)
    expect(JSON.parse(c.data.text).elements).toEqual([a])
    expect(c.prevented()).toBe(true)
  })

  test('copy with nothing selected is left to the browser', () => {
    const { editor } = setup()
    const c = fakeClipboard()
    handleClipboardEvent(editor, 'copy', c.event, view)
    expect(c.data.text).toBe('')
    expect(c.prevented()).toBe(false)
  })

  test('cut writes the payload and deletes the selection', () => {
    const { editor } = setup()
    editor.selectAll()
    const c = fakeClipboard()
    handleClipboardEvent(editor, 'cut', c.event, view)
    expect(c.data.text).not.toBe('')
    expect(editor.store.getState().document.elements).toEqual([])
  })

  test('paste adds the elements', () => {
    const { editor } = setup()
    editor.selectAll()
    const copy = fakeClipboard()
    handleClipboardEvent(editor, 'copy', copy.event, view)
    const paste = fakeClipboard(copy.data.text)
    handleClipboardEvent(editor, 'paste', paste.event, view)
    expect(editor.store.getState().document.elements).toHaveLength(2)
    expect(paste.prevented()).toBe(true)
  })

  test('pasting text that is not ours is left to the browser', () => {
    const { editor } = setup()
    const paste = fakeClipboard('hello')
    handleClipboardEvent(editor, 'paste', paste.event, view)
    expect(editor.store.getState().document.elements).toHaveLength(1)
    expect(paste.prevented()).toBe(false)
  })

  describe('pasting an image', () => {
    const png = new File(['x'], 'shot.png', { type: 'image/png' })

    test('hands the image file over and prevents the default', () => {
      const { editor } = setup()
      const onImage = vi.fn()
      const paste = fakeClipboard('', null, [png])
      handleClipboardEvent(editor, 'paste', paste.event, view, onImage)
      expect(onImage).toHaveBeenCalledWith(png)
      expect(paste.prevented()).toBe(true)
    })

    test('a Yodo payload wins over an image on the same clipboard', () => {
      const { editor } = setup()
      editor.selectAll()
      const copy = fakeClipboard()
      handleClipboardEvent(editor, 'copy', copy.event, view)
      const onImage = vi.fn()
      const paste = fakeClipboard(copy.data.text, null, [png])
      handleClipboardEvent(editor, 'paste', paste.event, view, onImage)
      expect(onImage).not.toHaveBeenCalled()
      expect(editor.store.getState().document.elements).toHaveLength(2)
    })

    test('other files and plain text are left to the browser', () => {
      const { editor } = setup()
      const onImage = vi.fn()
      const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
      const paste = fakeClipboard('hello', null, [pdf])
      handleClipboardEvent(editor, 'paste', paste.event, view, onImage)
      expect(onImage).not.toHaveBeenCalled()
      expect(paste.prevented()).toBe(false)
    })

    test('is left alone while a text field has focus', () => {
      const { editor } = setup()
      const onImage = vi.fn()
      const paste = fakeClipboard('', { tagName: 'TEXTAREA' }, [png])
      handleClipboardEvent(editor, 'paste', paste.event, view, onImage)
      expect(onImage).not.toHaveBeenCalled()
    })
  })

  test.each(['copy', 'cut', 'paste'] as const)(
    '%s is ignored while a text field has focus',
    (type) => {
      const { editor } = setup()
      editor.selectAll()
      const source = fakeClipboard()
      handleClipboardEvent(editor, 'copy', source.event, view)
      const c = fakeClipboard(source.data.text, { tagName: 'TEXTAREA' })
      handleClipboardEvent(editor, type, c.event, view)
      expect(c.prevented()).toBe(false)
      expect(editor.store.getState().document.elements).toHaveLength(1)
    },
  )
})

describe('edit shortcuts', () => {
  test('Ctrl+A and Cmd+A select all', () => {
    for (const extra of [{}, { ctrlKey: false, metaKey: true }]) {
      const { editor, a } = setup()
      const k = key('a', extra)
      expect(handleEditShortcut(editor, k.event)).toBe(true)
      expect(editor.store.getState().selectedIds).toEqual([a.id])
      expect(k.prevented()).toBe(true)
    }
  })

  test('Ctrl+D duplicates the selection', () => {
    const { editor } = setup()
    editor.selectAll()
    const k = key('D')
    expect(handleEditShortcut(editor, k.event)).toBe(true)
    expect(editor.store.getState().document.elements).toHaveLength(2)
    expect(k.prevented()).toBe(true)
  })

  test('other keys and other modifiers are not handled', () => {
    const { editor } = setup()
    expect(handleEditShortcut(editor, key('a', { ctrlKey: false }).event)).toBe(
      false,
    )
    expect(handleEditShortcut(editor, key('a', { shiftKey: true }).event)).toBe(
      false,
    )
    expect(handleEditShortcut(editor, key('a', { altKey: true }).event)).toBe(
      false,
    )
    expect(handleEditShortcut(editor, key('z').event)).toBe(false)
    expect(editor.store.getState().selectedIds).toEqual([])
  })
})

test('isEditable recognises fields', () => {
  expect(isEditable({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
  expect(
    isEditable({ isContentEditable: true } as unknown as EventTarget),
  ).toBe(true)
  expect(isEditable({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
  expect(isEditable(null)).toBe(false)
})

describe('isInsideDialog', () => {
  const inside = {
    closest: (selector: string) => (selector === 'dialog[open]' ? {} : null),
  } as unknown as EventTarget

  test('is true for an element inside an open dialog, false otherwise', () => {
    expect(isInsideDialog(inside)).toBe(true)
    expect(
      isInsideDialog({ closest: () => null } as unknown as EventTarget),
    ).toBe(false)
    expect(isInsideDialog(null)).toBe(false)
    expect(isInsideDialog({} as EventTarget)).toBe(false)
  })

  test('copy, cut and paste from inside a dialog leave the drawing alone', () => {
    const { editor, a } = setup()
    editor.store.setState((prev) => ({ ...prev, selectedIds: [a.id] }))
    for (const type of ['copy', 'cut', 'paste'] as const) {
      const { event, data, prevented } = fakeClipboard('anything', inside)
      handleClipboardEvent(editor, type, event, view)
      expect(prevented()).toBe(false)
      expect(data.text).toBe('anything')
    }
    expect(editor.store.getState().document.elements).toEqual([a])
  })
})

describe('isExportShortcut', () => {
  const base = {
    key: 'E',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
  }

  test('is Shift plus Ctrl or Cmd plus E', () => {
    expect(isExportShortcut(base)).toBe(true)
    expect(
      isExportShortcut({ ...base, ctrlKey: false, metaKey: true, key: 'e' }),
    ).toBe(true)
  })

  test.each([
    { shiftKey: false },
    { ctrlKey: false },
    { altKey: true },
    { key: 'x' },
  ])('is not %o', (change) => {
    expect(isExportShortcut({ ...base, ...change })).toBe(false)
  })
})
