import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { InMemoryImageRepository } from '../storage/memoryImages.ts'
import { InMemoryDrawingRepository } from '../storage/memory.ts'
import { createImageCache } from './imageCache.ts'
import type { Folder } from '../storage/folders.ts'
import type { DrawingSummary } from '../storage/repository.ts'
import { HomeView, type HomeViewProps } from './Home.tsx'

const now = Date.now()
const drawings: DrawingSummary[] = [
  { id: 'a', name: 'Beta', createdAt: 1, updatedAt: now - 120_000 },
  { id: 'b', name: 'alpha', createdAt: 3, updatedAt: now - 5_000 },
  { id: 'c', name: 'Gamma', createdAt: 2, updatedAt: now - 600_000 },
]

function render(props: Partial<HomeViewProps> = {}) {
  return renderToStaticMarkup(
    <HomeView
      repository={new InMemoryDrawingRepository()}
      imageCache={createImageCache(new InMemoryImageRepository())}
      list={{ status: 'loaded', drawings, folders: [] }}
      sort="recent"
      onSort={() => {}}
      creating={false}
      onCreate={() => {}}
      onRename={() => {}}
      onSaveFolder={() => {}}
      onDeleteFolder={() => {}}
      onMove={() => {}}
      onImport={() => {}}
      onRetry={() => {}}
      now={now}
      {...props}
    />,
  )
}

/** Card names in the order they appear. */
const names = (html: string) =>
  [...html.matchAll(/class="drawing-card-name">([^<]*)</g)].map((m) => m[1])

describe('HomeView', () => {
  test('offers one Import file button for .yodo and Excalidraw files', () => {
    const html = render()

    expect(html).toContain('Import file</button>')
    expect(html).toMatch(
      /<input[^>]*type="file"[^>]*accept="\.yodo,\.excalidraw,/,
    )
  })

  test('starts the grid with the New drawing tile', () => {
    const html = render()

    expect(html).toMatch(
      /<ul class="card-grid"[^>]*><li><button[^>]*class="new-drawing-tile"/,
    )
    expect(html).toContain('New drawing</button>')
  })

  test.each([
    ['recent', ['alpha', 'Beta', 'Gamma']],
    ['created', ['alpha', 'Gamma', 'Beta']],
    ['name', ['alpha', 'Beta', 'Gamma']],
  ] as const)('sorts the cards by %s', (sort, expected) => {
    expect(names(render({ sort }))).toEqual(expected)
  })

  test('each card links to its drawing and shows when it was edited', () => {
    const html = render()

    expect(html).toMatch(/<a class="drawing-card-body" href="#\/d\/a">/)
    expect(html).toContain('Edited 2 min ago')
    expect(html).toContain('Edited just now')
    expect(html).toContain('aria-label="More actions for Beta"')
    expect(html).toContain('aria-haspopup="menu"')
  })

  test('offers the three sort orders with the current one selected', () => {
    const html = render({ sort: 'name' })

    expect(html).toContain('<option value="recent">Last edited</option>')
    expect(html).toContain('<option value="name" selected="">Name</option>')
    expect(html).toContain('<option value="created">Date created</option>')
  })

  test('while loading: only the tile, marked busy', () => {
    const html = render({ list: { status: 'loading' } })

    expect(html).toContain('aria-busy="true"')
    expect(names(html)).toEqual([])
  })

  test('a failed list shows an error with Try again instead of the grid', () => {
    const html = render({ list: { status: 'error' } })

    expect(html).toContain('Couldn’t load your drawings.')
    expect(html).toContain('>Try again</button>')
    expect(html).not.toContain('card-grid')
  })

  test('disables the tile while a drawing is being created, and shows notices', () => {
    const html = render({ creating: true, notice: 'Couldn’t rename' })

    expect(html).toMatch(/<button[^>]*class="new-drawing-tile"[^>]*disabled=""/)
    expect(html).toMatch(/role="alert">Couldn’t rename</)
  })

  test('offers Import file, which is busy while importing', () => {
    expect(render()).toMatch(/<button[^>]*>Import file<\/button>/)
    expect(render({ importing: true })).toMatch(
      /<button[^>]*disabled=""[^>]*>Importing…<\/button>/,
    )
  })

  test('shows what an import changed, with a link to open the drawing', () => {
    const html = render({
      imported: { id: 'new', imported: 1, lines: ['Skipped frames (2)'] },
    })

    expect(html).toContain('Imported 1 element.')
    expect(html).toContain('Skipped frames (2)')
    expect(html).toMatch(/<a class="button-primary" href="#\/d\/new">/)
    expect(render()).not.toContain('import-summary')
  })

  describe('folders', () => {
    const folders: Folder[] = [
      {
        id: 'f1',
        name: 'Work',
        icon: 'briefcase',
        color: 'teal',
        createdAt: 1,
      },
    ]
    const inFolder: DrawingSummary[] = [
      { ...drawings[0]!, folderId: 'f1' },
      drawings[1]!,
      drawings[2]!,
    ]
    const withFolders = {
      status: 'loaded',
      drawings: inFolder,
      folders,
    } as const

    test('All drawings lists every drawing and names the folder on its card', () => {
      const html = render({ list: withFolders })
      expect(html).toContain('<h1>All drawings</h1>')
      expect(names(html)).toHaveLength(3)
      expect(html).toContain('drawing-card-folder')
    })

    test('a folder lists only its drawings, titled by the folder', () => {
      const html = render({ list: withFolders, folderId: 'f1' })
      expect(html).toContain('<h1>Work</h1>')
      expect(names(html)).toEqual(['Beta'])
      // The title says which folder; the card doesn't repeat it.
      expect(html).not.toContain('drawing-card-folder')
      expect(html).toContain('New drawing</button>')
    })

    test('a folder that is gone shows All drawings and says so', () => {
      const html = render({ list: withFolders, folderId: 'gone' })
      expect(html).toContain('<h1>All drawings</h1>')
      expect(names(html)).toHaveLength(3)
      expect(html).toMatch(/role="alert">That folder doesn’t exist any more\./)
    })

    // Before the folders load, a new drawing can't be put in the folder the
    // route names, so it must not be created yet (Codex review round 1, finding 1).
    test('on a folder route the New drawing tile waits for the folders to load', () => {
      const tile = /<button[^>]*class="new-drawing-tile"[^>]*>/
      expect(render({ list: { status: 'loading' }, folderId: 'f1' })).toMatch(
        /<button[^>]*class="new-drawing-tile"[^>]*disabled=""/,
      )
      expect(
        render({ list: { status: 'loading' } }).match(tile)![0],
      ).not.toContain('disabled')
      expect(
        render({ list: withFolders, folderId: 'f1' }).match(tile)![0],
      ).not.toContain('disabled')
    })

    test('while loading, a folder route shows no notice yet', () => {
      const html = render({ list: { status: 'loading' }, folderId: 'f1' })
      expect(html).not.toContain('doesn’t exist')
    })

    test('the sidebar lists the folders with their counts', () => {
      const html = render({ list: withFolders })
      expect(html).toContain('href="#/f/f1"')
      expect(html).toMatch(/Work<\/span><span class="sidebar-count">1</)
    })
  })
})
