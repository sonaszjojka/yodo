import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { HistoryControl } from './HistoryControl.tsx'

/** The opening tag of the button with this accessible label. */
function button(html: string, label: string) {
  return html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0]
}

test('both buttons are disabled on a fresh drawing', () => {
  const editor = createEditor(createDocument())

  const html = renderToStaticMarkup(<HistoryControl editor={editor} />)

  expect(button(html, 'Undo')).toContain('disabled')
  expect(button(html, 'Redo')).toContain('disabled')
})

test('undo is enabled after a change, redo after an undo', () => {
  const editor = createEditor(createDocument())
  editor.setTool('rectangle')
  editor.pointerDown(1, [10, 10], { button: 0, shift: false })
  editor.pointerMove(1, [60, 60], false)
  editor.pointerUp(1)

  let html = renderToStaticMarkup(<HistoryControl editor={editor} />)
  expect(button(html, 'Undo')).not.toContain('disabled')
  expect(button(html, 'Redo')).toContain('disabled')

  editor.undo()
  html = renderToStaticMarkup(<HistoryControl editor={editor} />)
  expect(button(html, 'Undo')).toContain('disabled')
  expect(button(html, 'Redo')).not.toContain('disabled')
})
