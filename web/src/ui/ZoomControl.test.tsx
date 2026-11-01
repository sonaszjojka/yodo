import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { ZoomControl } from './ZoomControl.tsx'

test('shows the current zoom as a rounded percentage', () => {
  const editor = createEditor(createDocument())
  editor.setZoom(1.234, [0, 0])

  const html = renderToStaticMarkup(<ZoomControl editor={editor} />)

  expect(html).toContain('123%')
  expect(html).toContain('aria-label="Zoom out"')
  expect(html).toContain('aria-label="Zoom in"')
  expect(html).toContain('aria-label="Reset zoom to 100%"')
})
