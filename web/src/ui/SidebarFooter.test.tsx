import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SidebarFooter } from './SidebarFooter.tsx'

test('offers the theme control and Keyboard shortcuts, with the dialog closed', () => {
  const html = renderToStaticMarkup(<SidebarFooter />)

  expect(html).toContain('aria-label="Theme"')
  expect(html).toContain('Keyboard shortcuts</span>')
  expect(html).toContain('<dialog')
  expect(html).not.toContain('shortcuts-body')
})
