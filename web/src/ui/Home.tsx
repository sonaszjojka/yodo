import { Plus } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import {
  createDrawing,
  renameDrawing,
  sortDrawings,
  type DrawingSort,
} from '../storage/drawings.ts'
import type {
  DrawingRepository,
  DrawingSummary,
} from '../storage/repository.ts'
import type { ImageCache } from './imageCache.ts'
import { DrawingCard } from './DrawingCard.tsx'
import { Logo } from './Logo.tsx'
import { navigate } from './route.ts'
import { SettingsMenu } from './SettingsMenu.tsx'

export type HomeList =
  | { status: 'loading' }
  | { status: 'loaded'; drawings: DrawingSummary[] }
  | { status: 'error' }

export interface HomeProps {
  repository: DrawingRepository
  imageCache: ImageCache
  /** Resolves once the editor that just closed has saved (see Root). */
  waitForEditor(): Promise<unknown>
  /** The editor that closed last failed to save its final changes. */
  lastSaveFailed?: boolean
}

/** The Home screen (`docs/ui.md`, Home): every drawing as a card. */
export function Home({
  repository,
  imageCache,
  waitForEditor,
  lastSaveFailed = false,
}: HomeProps) {
  const [list, setList] = useState<HomeList>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState<DrawingSort>('recent')
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string>()
  // "Edited 5 min ago" is relative to when the list was loaded; render stays pure.
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let cancelled = false
    // Listing before the closing editor's last save would show it stale.
    waitForEditor()
      .then(() => repository.list())
      .then(
        (drawings) => {
          if (cancelled) return
          setNow(Date.now())
          setList({ status: 'loaded', drawings })
        },
        (error: unknown) => {
          console.error('Could not list the drawings', error)
          if (!cancelled) setList({ status: 'error' })
        },
      )
    return () => {
      cancelled = true
    }
  }, [repository, waitForEditor, attempt])

  async function onCreate() {
    setCreating(true)
    setNotice(undefined)
    try {
      navigate({ name: 'drawing', id: await createDrawing(repository) })
    } catch (error) {
      console.error('Could not create a drawing', error)
      setNotice('Couldn’t create a drawing. Try again.')
      setCreating(false)
    }
  }

  async function onRename(id: string, name: string) {
    setNotice(undefined)
    try {
      const summary = await renameDrawing(repository, id, name)
      if (!summary) return
      setList((current) =>
        current.status === 'loaded'
          ? {
              status: 'loaded',
              drawings: current.drawings.map((d) =>
                d.id === id ? summary : d,
              ),
            }
          : current,
      )
    } catch (error) {
      console.error('Could not rename the drawing', error)
      setNotice('Couldn’t rename the drawing. Try again.')
    }
  }

  return (
    <HomeView
      repository={repository}
      imageCache={imageCache}
      list={list}
      sort={sort}
      onSort={setSort}
      creating={creating}
      onCreate={() => void onCreate()}
      onRename={(id, name) => void onRename(id, name)}
      onRetry={() => {
        setList({ status: 'loading' })
        setAttempt((n) => n + 1)
      }}
      notice={
        notice ??
        (lastSaveFailed
          ? 'Your last changes to a drawing couldn’t be saved.'
          : undefined)
      }
      now={now}
    />
  )
}

const SORTS: { value: DrawingSort; label: string }[] = [
  { value: 'recent', label: 'Last edited' },
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Date created' },
]

export interface HomeViewProps {
  repository: DrawingRepository
  imageCache: ImageCache
  list: HomeList
  sort: DrawingSort
  onSort(sort: DrawingSort): void
  creating: boolean
  onCreate(): void
  onRename(id: string, name: string): void
  onRetry(): void
  notice?: string
  now: number
}

/** Home's markup, apart from its data loading, so it renders in tests. */
export function HomeView({
  repository,
  imageCache,
  list,
  sort,
  onSort,
  creating,
  onCreate,
  onRename,
  onRetry,
  notice,
  now,
}: HomeViewProps) {
  return (
    <div className="home">
      <header className="home-header">
        <Logo />
        <SettingsMenu />
      </header>
      <main className="home-main">
        <div className="home-title-row">
          <h1>All drawings</h1>
          <label className="home-sort">
            Sort by
            <select
              value={sort}
              onChange={(event) => onSort(event.target.value as DrawingSort)}
            >
              {SORTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {notice && (
          <p className="home-notice" role="alert">
            {notice}
          </p>
        )}
        {list.status === 'error' ? (
          <div className="home-error" role="alert">
            <p>Couldn’t load your drawings.</p>
            <button type="button" className="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : (
          <ul className="card-grid" aria-busy={list.status === 'loading'}>
            <li>
              <button
                type="button"
                className="new-drawing-tile"
                disabled={creating}
                onClick={onCreate}
              >
                <Plus size={28} />
                New drawing
              </button>
            </li>
            {list.status === 'loaded' &&
              sortDrawings(list.drawings, sort).map((summary) => (
                <DrawingCard
                  key={summary.id}
                  summary={summary}
                  repository={repository}
                  imageCache={imageCache}
                  now={now}
                  onRename={(name) => onRename(summary.id, name)}
                />
              ))}
          </ul>
        )}
      </main>
    </div>
  )
}
