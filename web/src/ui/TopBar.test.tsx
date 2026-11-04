import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { TopBar } from './TopBar.tsx'

test('links back to Home and shows the drawing name', () => {
  const html = renderToStaticMarkup(
    <TopBar editor={createEditor(createDocument('Sketch <1>'))} />,
  )

  expect(html).toMatch(/<a[^>]*href="#\/"[^>]*aria-label="Back to Home"/)
  expect(html).toContain('>Sketch &lt;1&gt;</span>')
})
