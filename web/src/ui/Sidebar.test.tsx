import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { Folder } from '../storage/folders.ts'
import { Sidebar, type SidebarProps } from './Sidebar.tsx'

const folder = (id: string, name: string, icon = 'folder', color = 'teal') =>
  ({ id, name, icon, color, createdAt: 1 }) satisfies Folder

function render(props: Partial<SidebarProps> = {}) {
  return renderToStaticMarkup(
    <Sidebar
      folders={[folder('f2', 'Work'), folder('f1', 'archive')]}
      counts={new Map([['f2', 3]])}
      total={5}
      onSaveFolder={() => {}}
      onDeleteFolder={() => {}}
      {...props}
    />,
  )
}

test('lists All drawings with its count, then the folders by name, then Trash', () => {
  const html = render()
  expect(html).toMatch(/href="#\/"[^>]*aria-current="page"/)
  expect(html).toContain('>5</span>')
  const names = [...html.matchAll(/sidebar-link-name">([^<]*)</g)].map(
    (m) => m[1],
  )
  expect(names).toEqual(['All drawings', 'archive', 'Work', 'Trash'])
})

test('each folder links to its route and shows how many drawings it holds', () => {
  const html = render()
  expect(html).toContain('href="#/f/f2"')
  expect(html).toMatch(/Work<\/span><span class="sidebar-count">3</)
  // A folder with no drawings counts 0.
  expect(html).toMatch(/archive<\/span><span class="sidebar-count">0</)
})

test('marks only the selected folder as the current page', () => {
  const html = render({ selectedId: 'f2' })
  expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  expect(html).toMatch(/href="#\/f\/f2"[^>]*aria-current="page"/)
  expect(html).not.toMatch(/href="#\/"[^>]*aria-current/)
})

test('offers New folder and a ⋯ menu button per folder', () => {
  const html = render()
  expect(html).toContain('aria-label="New folder"')
  expect(html).toContain('aria-label="More actions for folder Work"')
  expect(html).toContain('aria-haspopup="menu"')
})

test('says so when there are no folders', () => {
  expect(render({ folders: [], counts: new Map() })).toContain(
    'No folders yet.',
  )
  expect(render()).not.toContain('No folders yet.')
})

test('shows each folder icon in its colour, and a safe default for unknown keys', () => {
  const html = render({
    folders: [folder('f1', 'Odd', 'not-an-icon', 'chartreuse')],
  })
  expect(html).toContain('light-dark(#6B7280, #9AA1AA)')
})

test('escapes folder names', () => {
  const html = render({ folders: [folder('f1', '<b>x</b>')] })
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  expect(html).not.toContain('<b>x</b>')
})

test('links to Trash, with a count when it is known (ADR 0046)', () => {
  expect(render()).toMatch(/href="#\/trash"[^>]*>.*Trash<\/span>/)
  expect(render()).not.toMatch(/Trash<\/span><span class="sidebar-count">/)
  expect(render({ trashCount: 4 })).toMatch(
    /Trash<\/span><span class="sidebar-count">4</,
  )
})

test('marks Trash, and not All drawings, as the current page on the Trash screen', () => {
  const html = render({ trashSelected: true })
  expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  expect(html).toMatch(/href="#\/trash"[^>]*aria-current="page"/)
  expect(html).not.toMatch(/href="#\/"[^>]*aria-current/)
})
