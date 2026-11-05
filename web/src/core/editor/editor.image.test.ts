import { describe, expect, test } from 'vitest'
import { createDocument, createShape } from '../document/create.ts'
import { createEditor } from './editor.ts'

const view = { x: 0, y: 0, width: 1000, height: 800 }
const fileId = 'c'.repeat(64)

describe('addImage', () => {
  test('adds the image centred, selects it and switches to Select', () => {
    const editor = createEditor(createDocument())
    editor.setTool('rectangle')

    editor.addImage({ fileId, width: 200, height: 100 }, view)

    const { document, selectedIds, tool } = editor.store.getState()
    expect(document.elements).toHaveLength(1)
    expect(document.elements[0]).toMatchObject({
      type: 'image',
      fileId,
      x: 400,
      y: 350,
      width: 200,
      height: 100,
    })
    expect(selectedIds).toEqual([document.elements[0]!.id])
    expect(tool).toBe('select')
  })

  test('is one undo step', () => {
    const rect = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })
    const editor = createEditor({ ...createDocument(), elements: [rect] })

    editor.addImage({ fileId, width: 200, height: 100 }, view)
    expect(editor.store.getState().document.elements).toHaveLength(2)

    editor.undo()
    expect(editor.store.getState().document.elements).toEqual([rect])
  })

  test('an image element copies and pastes through the clipboard payload', () => {
    const editor = createEditor(createDocument())
    editor.addImage({ fileId, width: 200, height: 100 }, view)

    const text = editor.copySelected()
    expect(editor.paste(text!, view)).toBe(true)

    const images = editor.store.getState().document.elements
    expect(images).toHaveLength(2)
    expect(images.map((e) => e.type === 'image' && e.fileId)).toEqual([
      fileId,
      fileId,
    ])
  })
})
