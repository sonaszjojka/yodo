import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ExportButton } from './ExportButton.tsx'

test('renders a labelled Export button that is never disabled', () => {
  const html = renderToStaticMarkup(<ExportButton onOpen={() => {}} />)

  expect(html).toContain('type="button"')
  expect(html).toContain('Export</button>')
  expect(html).toContain('title="Export (Shift+Ctrl/Cmd+E)"')
  expect(html).not.toMatch(/<button[^>]*disabled/)
})
