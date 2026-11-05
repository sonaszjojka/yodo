import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { SettingsMenu, ThemeOptions } from './SettingsMenu.tsx'

test('lists System, Light and Dark as radios with the current one checked', () => {
  const html = renderToStaticMarkup(
    <ThemeOptions choice="dark" onChoose={vi.fn()} />,
  )

  expect(html.match(/role="menuitemradio"/g)).toHaveLength(3)
  expect(html).toMatch(/aria-checked="true"[^>]*>Dark/)
  expect(html).toMatch(/aria-checked="false"[^>]*>System/)
  expect(html).toMatch(/aria-checked="false"[^>]*>Light/)
})

test('the Settings button starts closed with the menu popup announced', () => {
  const html = renderToStaticMarkup(<SettingsMenu />)

  expect(html).toContain('aria-label="Settings"')
  expect(html).toContain('aria-haspopup="menu"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('role="menu"')
})
