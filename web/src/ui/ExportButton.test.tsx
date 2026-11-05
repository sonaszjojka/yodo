import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { InMemoryImageRepository } from '../storage/memoryImages.ts'
import { ExportButton } from './ExportButton.tsx'

test('renders a labelled Export button', () => {
  const editor = createEditor(createDocument())

  const html = renderToStaticMarkup(
    <ExportButton
      editor={editor}
      images={new InMemoryImageRepository()}
      onError={() => {}}
    />,
  )

  expect(html).toContain('type="button"')
  expect(html).toContain('Export</button>')
})
