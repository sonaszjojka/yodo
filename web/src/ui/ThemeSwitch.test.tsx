import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { ThemeSwitch } from './ThemeSwitch.tsx'

test('lists System, Light and Dark as radios with the current one checked and tabbable', () => {
  const html = renderToStaticMarkup(
    <ThemeSwitch choice="dark" onChoose={vi.fn()} />,
  )

  expect(html).toContain('role="radiogroup"')
  expect(html.match(/role="radio"/g)).toHaveLength(3)
  expect(html).toMatch(
    /aria-checked="true"[^>]*aria-label="Dark"[^>]*tabindex="0"/,
  )
  expect(html).toMatch(
    /aria-checked="false"[^>]*aria-label="System"[^>]*tabindex="-1"/,
  )
  expect(html).toMatch(
    /aria-checked="false"[^>]*aria-label="Light"[^>]*tabindex="-1"/,
  )
})
