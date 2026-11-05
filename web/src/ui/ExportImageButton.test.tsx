import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { createDocument, createShape } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { ExportImageButton } from './ExportImageButton.tsx'

test('is disabled for an empty drawing and enabled otherwise', () => {
  const empty = renderToStaticMarkup(
    <ExportImageButton
      editor={createEditor(createDocument())}
      onOpen={vi.fn()}
    />,
  )
  const rect = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 })
  const filled = renderToStaticMarkup(
    <ExportImageButton
      editor={createEditor({ ...createDocument(), elements: [rect] })}
      onOpen={vi.fn()}
    />,
  )

  expect(empty).toMatch(/<button[^>]*disabled/)
  expect(filled).not.toMatch(/<button[^>]*disabled/)
  expect(filled).toContain('Export image')
})
