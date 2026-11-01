import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import tile from '../assets/logo-tile.svg?raw'
import { Logo } from './Logo.tsx'

test('Logo inlines the same tile file the favicon uses', () => {
  const html = renderToStaticMarkup(<Logo />)
  expect(html).toContain(tile.trim())
  expect(html).toContain('Yodo')
})
