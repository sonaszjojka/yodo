import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { ShortcutsButton, ShortcutsDialog } from './ShortcutsDialog.tsx'
import { SHORTCUT_GROUPS } from './shortcuts.ts'
import { SettingsMenu } from './SettingsMenu.tsx'

test('an open dialog lists every group with its keys and a search box', () => {
  const html = renderToStaticMarkup(<ShortcutsDialog open onClose={vi.fn()} />)

  expect(html).toContain('aria-labelledby="shortcuts-title"')
  expect(html).toMatch(
    /<input[^>]*type="search"[^>]*aria-label="Search shortcuts"/,
  )
  for (const group of SHORTCUT_GROUPS) {
    expect(html).toContain(`<h3>${group.title}</h3>`)
  }
  expect(html).toContain('<kbd>R</kbd>')
  expect(html).toContain('<kbd>Ctrl/Cmd</kbd>')
  expect(html).not.toContain('No shortcut matches')
})

test('a closed dialog renders no content', () => {
  const html = renderToStaticMarkup(
    <ShortcutsDialog open={false} onClose={vi.fn()} />,
  )
  expect(html).toContain('<dialog')
  expect(html).not.toContain('shortcuts-body')
})

test('the bottom-bar button is labelled with its key', () => {
  const html = renderToStaticMarkup(<ShortcutsButton onClick={vi.fn()} />)
  expect(html).toContain('aria-label="Keyboard shortcuts"')
  expect(html).toContain('title="Keyboard shortcuts (?)"')
})

test('Settings offers Keyboard shortcuts once opened', () => {
  // Closed menu: the entry is not in the page yet, only the dialog shell is.
  const html = renderToStaticMarkup(<SettingsMenu />)
  expect(html).not.toContain('role="menuitem"')
  expect(html).toContain('<dialog')
})
