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
  {
    id: 'a',
    name: 'Beta',
    createdAt: 1,
    updatedAt: now - 120_000,
    revision: 1,
  },
  { id: 'b', name: 'alpha', createdAt: 3, updatedAt: now - 5_000, revision: 1 },
  {
    id: 'c',
    name: 'Gamma',
    createdAt: 2,
    updatedAt: now - 600_000,
    revision: 1,
  },
]

function render(props: Partial<HomeViewProps> = {}) {
  return renderToStaticMarkup(
    <HomeView
      repository={new InMemoryDrawingRepository()}
      imageCache={createImageCache(new InMemoryImageRepository())}
      list={{ status: 'loaded', drawings, trashed: [], folders: [] }}
      sort="recent"
      onSort={() => {}}
      creating={false}
      onCreate={() => {}}
      onRename={() => {}}
      onSaveFolder={() => {}}
      onDeleteFolder={() => {}}
      onMove={() => {}}
      onDuplicate={() => {}}
      onExport={() => {}}
      onTrash={() => {}}
      onRestore={() => {}}
      onDeleteForever={() => {}}
      onEmptyTrash={() => {}}
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

  test('puts the theme control in the sidebar and no Settings button', () => {
    const html = render()

    expect(html).not.toContain('aria-label="Settings"')
    expect(html).not.toContain('home-header')
    expect(html).toMatch(/<aside[\s\S]*role="radiogroup"[\s\S]*<\/aside>/)
  })

  test('lays out search, Import file and Sort by in one toolbar under the title', () => {
    for (const html of [render(), render({ query: 'alpha' })]) {
      const toolbar = html.match(
        /class="home-toolbar">[\s\S]*?<\/label><\/div>/,
      )
      expect(toolbar?.[0]).toContain('type="search"')
      expect(toolbar?.[0]).toContain('Import file')
      expect(toolbar?.[0]).toContain('Sort by')
      expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('home-toolbar'))
    }
  })

  test('has no toolbar in Trash', () => {
    expect(render({ view: 'trash' })).not.toContain('home-toolbar')
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
      trashed: [] as DrawingSummary[],
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

  describe('Trash (ADR 0046)', () => {
    const trashed: DrawingSummary[] = [
      {
        id: 't1',
        name: 'Old plan',
        createdAt: 1,
        updatedAt: 2,
        revision: 1,
        deletedAt: now - 120_000,
      },
      {
        id: 't2',
        name: 'Newer plan',
        createdAt: 1,
        updatedAt: 2,
        revision: 1,
        deletedAt: now - 5_000,
      },
    ]
    const withTrash = {
      status: 'loaded',
      drawings,
      trashed,
      folders: [] as Folder[],
    } as const

    test('the sidebar always links to Trash and shows its count', () => {
      expect(render()).toMatch(
        /href="#\/trash"[^>]*>.*Trash<\/span><span class="sidebar-count">0</,
      )
      expect(render({ list: withTrash })).toMatch(
        /Trash<\/span><span class="sidebar-count">2</,
      )
    })

    test('the Trash view replaces the cards and marks its link as the page', () => {
      const html = render({ list: withTrash, view: 'trash' })
      expect(html).toContain('<h1>Trash</h1>')
      expect(html).not.toContain('card-grid')
      expect(html).not.toContain('new-drawing-tile')
      expect(html).not.toContain('Import file')
      expect(html).toMatch(/href="#\/trash"[^>]*aria-current="page"/)
      // Only one link is the current page.
      expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    })

    test('lists the drawings in Trash, newest deletion first, with the count and rule', () => {
      const html = render({ list: withTrash, view: 'trash' })
      expect(
        [...html.matchAll(/class="trash-name">([^<]*)</g)].map((m) => m[1]),
      ).toEqual(['Newer plan', 'Old plan'])
      expect(html).toContain('2 drawings in Trash')
      expect(html).toContain('Drawings are deleted forever after 30 days.')
      expect(html).toContain('Deleted just now')
      expect(html).toContain('Deleted 2 min ago')
      expect(html).toContain('aria-label="Restore Old plan"')
      expect(html).toContain('aria-label="Delete Old plan forever"')
    })

    test('an empty Trash says so and cannot be emptied', () => {
      const html = render({ view: 'trash' })
      expect(html).toContain('Trash is empty')
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Empty trash<\/button>/)
      expect(html).not.toContain('trash-list')
    })

    test('trashed drawings are not cards', () => {
      expect(names(render({ list: withTrash }))).toHaveLength(3)
    })

    test('the Trash route is not a missing folder', () => {
      const html = render({ list: withTrash, view: 'trash', folderId: 'gone' })
      expect(html).not.toContain('doesn’t exist')
    })
  })
})

describe('HomeView search (ADR 0047)', () => {
  const index = (entries: { id: string; searchText: string }[]) => ({
    status: 'ready' as const,
    forList: drawings,
    entries,
  })

  test('has a search box in the title row', () => {
    const html = render()
    expect(html).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Search drawings"/,
    )
  })

  test('hides the search box in Trash', () => {
    expect(render({ view: 'trash' })).not.toContain('Search drawings')
  })

  test('shows the normal grid with its tile while the query is blank', () => {
    const html = render({ query: '   ' })
    expect(html).toContain('new-drawing-tile')
    expect(html).not.toContain('In names')
  })

  test('replaces the grid with the two sections and hides the tile', () => {
    const html = render({
      query: 'alp',
      searchIndex: index([{ id: 'c', searchText: 'the alpine route' }]),
    })
    expect(html).not.toContain('new-drawing-tile')
    expect(html).toContain('>In names</h2>')
    expect(html).toContain('>In text on the canvas</h2>')
    // The name match is a normal card.
    expect(names(html)).toEqual(['alpha'])
    // The text match is a row that opens its drawing, with the match marked.
    expect(html).toMatch(
      /<a class="search-row" href="#\/d\/c"><span class="search-row-name">Gamma<\/span><span class="search-row-snippet">the <mark>alp<\/mark>ine route<\/span><\/a>/,
    )
  })

  test('lists name matches in the chosen sort order', () => {
    const named = [
      {
        id: 'x',
        name: 'Zed note',
        createdAt: 1,
        updatedAt: now - 1_000,
        revision: 1,
      },
      {
        id: 'y',
        name: 'Alpha note',
        createdAt: 2,
        updatedAt: now - 9_000,
        revision: 1,
      },
    ]
    const list = {
      status: 'loaded' as const,
      drawings: named,
      trashed: [],
      folders: [],
    }
    expect(names(render({ list, query: 'note', sort: 'recent' }))).toEqual([
      'Zed note',
      'Alpha note',
    ])
    expect(names(render({ list, query: 'note', sort: 'name' }))).toEqual([
      'Alpha note',
      'Zed note',
    ])
  })

  test('shows Searching… until the index is ready', () => {
    const html = render({ query: 'alp' })
    expect(html).toContain('Searching…')
    expect(names(html)).toEqual(['alpha'])
  })

  test('says so when the index failed, and still lists name matches', () => {
    const html = render({
      query: 'alp',
      searchIndex: { status: 'error', forList: drawings },
    })
    expect(html).toContain('Text on the canvas couldn’t be searched.')
    expect(names(html)).toEqual(['alpha'])
  })

  test('says when nothing matches', () => {
    const html = render({ query: 'zzz', searchIndex: index([]) })
    expect(html).toContain('No drawings match “zzz”.')
    expect(html).not.toContain('In names')
  })

  test('escapes the query and snippets', () => {
    const html = render({
      query: '<b>',
      searchIndex: index([{ id: 'a', searchText: 'x <b> y' }]),
    })
    expect(html).toContain('<mark>&lt;b&gt;</mark>')
    expect(html).not.toContain('<mark><b>')
  })
})
