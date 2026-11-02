import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { TextEditor } from './TextEditor.tsx'

function editorEditingAt(screen: [number, number]) {
  const editor = createEditor(createDocument(), { measure: () => 30 })
  editor.setTool('text')
  editor.pointerDown(1, screen, { button: 0, shift: false })
  editor.pointerUp(1)
  return editor
}

test('renders nothing when no text is being edited', () => {
  const editor = createEditor(createDocument())
  expect(renderToStaticMarkup(<TextEditor editor={editor} />)).toBe('')
})

test('shows a textarea with the edited text where it will be drawn', () => {
  const editor = editorEditingAt([100, 100])
  editor.setEditingText('Hello')

  const html = renderToStaticMarkup(<TextEditor editor={editor} />)

  expect(html).toMatch(/^<textarea[^>]*aria-label="Text"/)
  expect(html).toContain('>Hello</textarea>')
  // The first line is centred on the click: 25 px line, so top is 87.5.
  expect(html).toContain('left:100px')
  expect(html).toContain('top:87.5px')
  expect(html).toContain('width:32px')
  expect(html).toContain('wrap="off"')
})

test('scales the font and box with the zoom', () => {
  const editor = editorEditingAt([0, 0])
  editor.setZoom(2, [0, 0])

  const html = renderToStaticMarkup(<TextEditor editor={editor} />)

  // Line height inside the shorthand: a separate lineHeight would be reset
  // by React updating only `font` on the next zoom.
  expect(html).toContain('font:40px/1.25 &quot;Caveat Variable&quot;, cursive')
  expect(html).not.toContain('line-height')
  expect(html).toContain('height:50px')
})
