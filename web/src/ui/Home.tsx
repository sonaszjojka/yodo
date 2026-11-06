import { Plus } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import {
  describeSummary,
  ExcalidrawImportError,
  hasLosses,
} from '../core/excalidraw/convert.ts'
import {
  createDrawing,
  renameDrawing,
  sortDrawings,
  type DrawingSort,
} from '../storage/drawings.ts'
import {
  importExcalidrawFile,
  MAX_IMPORT_BYTES,
} from '../storage/importExcalidraw.ts'
import {
  createFolder,
  type Folder,
  type FolderRepository,
} from '../storage/folders.ts'
import type { ImageRepository } from '../storage/images.ts'
import type {
  DrawingRepository,
  DrawingSummary,
} from '../storage/repository.ts'
import { purgeExpiredTrash } from '../storage/trash.ts'
import type { ImageCache } from './imageCache.ts'
import { DrawingCard } from './DrawingCard.tsx'
import type { FolderValues } from './FolderDialog.tsx'
import { activeFolder, drawingsInView, folderCounts } from './homeFolders.ts'
import { createCanvasMeasure } from './measure.ts'
import { navigate } from './route.ts'
import { SettingsMenu } from './SettingsMenu.tsx'
import { withoutDrawing } from './homeTrash.ts'
import { Sidebar } from './Sidebar.tsx'
import { TrashView } from './TrashView.tsx'
import { importErrorMessage, importFile, isYodoFile } from './yodoFile.ts'

export type HomeList =
  | { status: 'loading' }
  | {
      status: 'loaded'
      drawings: DrawingSummary[]
      /** The drawings in Trash (ADR 0046). */
      trashed: DrawingSummary[]
      folders: Folder[]
    }
  | { status: 'error' }

export interface HomeProps {
  repository: DrawingRepository
  folders: FolderRepository
  /** The folder the route names (`#/f/<id>`); undefined shows All drawings. */
  folderId?: string
  /** `trash` shows the Trash instead of the cards (`#/trash`, ADR 0046). */
  view?: 'drawings' | 'trash'
  /** Where an import's pictures are stored (ADR 0040). */
  images: ImageRepository
  imageCache: ImageCache
  /** Resolves once the editor that just closed has saved (see Root). */
  waitForEditor(): Promise<unknown>
  /** The editor that closed last failed to save its final changes. */
  lastSaveFailed?: boolean
}

/** A summary that is no longer in `folderId` (its folder was deleted). */
function withoutFolder(folderId: string) {
  return (summary: DrawingSummary): DrawingSummary => {
    if (summary.folderId !== folderId) return summary
    const { folderId: _folder, ...rest } = summary
    return rest
  }
}

/** The Home screen (`docs/ui.md`, Home): every drawing as a card. */
export function Home({
  repository,
  folders,
  folderId,
  view = 'drawings',
  images,
  imageCache,
  waitForEditor,
  lastSaveFailed = false,
}: HomeProps) {
  const [list, setList] = useState<HomeList>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState<DrawingSort>('recent')
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<ImportedDrawing>()
  // "Edited 5 min ago" is relative to when the list was loaded; render stays pure.
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let cancelled = false
    // Listing before the closing editor's last save would show it stale.
    waitForEditor()
      // Before listing, so the lists never show what the sweep just removed.
      .then(() => purgeExpiredTrash(repository, Date.now()))
      .then(() =>
        Promise.all([
          repository.list(),
          repository.listTrash(),
          folders.list(),
        ]),
      )
      .then(
        ([drawings, trashed, folderList]) => {
          if (cancelled) return
          setNow(Date.now())
          setList({
            status: 'loaded',
            drawings,
            trashed,
            folders: folderList,
          })
        },
        (error: unknown) => {
          console.error('Could not list the drawings and folders', error)
          if (!cancelled) setList({ status: 'error' })
        },
      )
    return () => {
      cancelled = true
    }
  }, [repository, folders, waitForEditor, attempt])

  /** The folder being viewed, if the route names one that still exists. */
  const current =
    list.status === 'loaded' ? activeFolder(list.folders, folderId) : undefined

  async function onCreate() {
    setCreating(true)
    setNotice(undefined)
    try {
      const id = await createDrawing(repository)
      if (current) {
        // Two calls: if the move fails the drawing exists, in All drawings.
        try {
          await repository.move(id, current.id)
        } catch (error) {
          console.error('Could not put the new drawing in its folder', error)
          setNotice(
            'Created the drawing, but couldn’t put it in the folder. It is in All drawings.',
          )
          setCreating(false)
          setAttempt((n) => n + 1)
          return
        }
      }
      navigate({ name: 'drawing', id })
    } catch (error) {
      console.error('Could not create a drawing', error)
      setNotice('Couldn’t create a drawing. Try again.')
      setCreating(false)
    }
  }

  /** A `.yodo` file: recreated as it was, so there is no summary to show (ADR 0013). */
  async function importYodo(file: File) {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new ExcalidrawImportError('That file is larger than 50 MB.')
    }
    const text = await file.text()
    navigate({
      name: 'drawing',
      id: await importFile(repository, images, imageCache, text),
    })
  }

  async function onImport(file: File) {
    setImporting(true)
    setNotice(undefined)
    setImported(undefined)
    try {
      // The file's extension picks the format; anything else is tried as Excalidraw.
      if (isYodoFile(file)) {
        await importYodo(file)
        return
      }
      if (file.size > MAX_IMPORT_BYTES) {
        throw new ExcalidrawImportError('That file is larger than 50 MB.')
      }
      const { id, summary } = await importExcalidrawFile(await file.text(), {
        drawings: repository,
        images,
        measure: createCanvasMeasure(),
      })
      // Anything lost on the way is shown first; a clean import just opens.
      if (hasLosses(summary)) {
        setImported({
          id,
          imported: summary.imported,
          lines: describeSummary(summary),
        })
        setImporting(false)
        // The summary links to the drawing only until dismissed; its card must be listed.
        setAttempt((n) => n + 1)
      } else {
        navigate({ name: 'drawing', id })
      }
    } catch (error) {
      console.error('Could not import the file', error)
      setNotice(
        error instanceof ExcalidrawImportError
          ? error.message
          : isYodoFile(file)
            ? importErrorMessage(error)
            : 'Couldn’t import the file. Try again.',
      )
      setImporting(false)
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
              ...current,
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

  /** Replaces what the list holds, if it has loaded. */
  function updateLoaded(
    change: (loaded: Extract<HomeList, { status: 'loaded' }>) => HomeList,
  ) {
    setList((c) => (c.status === 'loaded' ? change(c) : c))
  }

  async function onSaveFolder(values: FolderValues, existing?: Folder) {
    setNotice(undefined)
    try {
      if (existing) {
        const saved = await folders.save({ id: existing.id, ...values })
        updateLoaded((c) => ({
          ...c,
          folders: c.folders.map((f) => (f.id === saved.id ? saved : f)),
        }))
        return
      }
      const created = await createFolder(folders, values)
      if (!created) return
      updateLoaded((c) => ({ ...c, folders: [...c.folders, created] }))
      navigate({ name: 'home', folderId: created.id })
    } catch (error) {
      console.error('Could not save the folder', error)
      setNotice('Couldn’t save the folder. Try again.')
    }
  }

  async function onDeleteFolder(folder: Folder) {
    setNotice(undefined)
    try {
      await folders.delete(folder.id)
      // Its drawings went to Trash, outside the folder (ADR 0046). The time is
      // this tab's; the next load shows the stored one.
      const deletedAt = Date.now()
      updateLoaded((c) => ({
        ...c,
        folders: c.folders.filter((f) => f.id !== folder.id),
        drawings: c.drawings.filter((d) => d.folderId !== folder.id),
        trashed: [
          ...c.trashed.map(withoutFolder(folder.id)),
          ...c.drawings
            .filter((d) => d.folderId === folder.id)
            .map((d) => ({ ...withoutFolder(folder.id)(d), deletedAt })),
        ],
      }))
      if (folderId === folder.id) navigate({ name: 'home' })
    } catch (error) {
      console.error('Could not delete the folder', error)
      setNotice('Couldn’t delete the folder. Try again.')
    }
  }

  async function onTrash(id: string) {
    setNotice(undefined)
    try {
      const summary = await repository.trash(id)
      updateLoaded((c) => ({
        ...c,
        drawings: c.drawings.filter((d) => d.id !== id),
        // undefined: the drawing is gone (deleted elsewhere), so just drop it.
        trashed: summary
          ? [...c.trashed.filter((d) => d.id !== id), summary]
          : c.trashed,
      }))
    } catch (error) {
      console.error('Could not move the drawing to Trash', error)
      setNotice('Couldn’t move the drawing to Trash. Try again.')
    }
  }

  async function onRestore(id: string) {
    setNotice(undefined)
    try {
      const summary = await repository.restore(id)
      updateLoaded((c) => ({
        ...c,
        trashed: c.trashed.filter((d) => d.id !== id),
        drawings: summary
          ? [...c.drawings.filter((d) => d.id !== id), summary]
          : c.drawings,
      }))
    } catch (error) {
      console.error('Could not restore the drawing', error)
      setNotice('Couldn’t restore the drawing. Try again.')
    }
  }

  async function onDeleteForever(id: string) {
    setNotice(undefined)
    try {
      await repository.delete(id)
      updateLoaded((c) => ({ ...c, ...withoutDrawing(c, id) }))
    } catch (error) {
      console.error('Could not delete the drawing', error)
      setNotice('Couldn’t delete the drawing. Try again.')
    }
  }

  async function onEmptyTrash() {
    setNotice(undefined)
    try {
      await repository.emptyTrash()
      updateLoaded((c) => ({ ...c, trashed: [] }))
    } catch (error) {
      console.error('Could not empty Trash', error)
      setNotice('Couldn’t empty Trash. Try again.')
    }
  }

  async function onMove(id: string, target: string | null) {
    setNotice(undefined)
    try {
      const summary = await repository.move(id, target)
      updateLoaded((c) => ({
        ...c,
        // undefined: the drawing is gone (deleted elsewhere), so drop its card.
        drawings: summary
          ? c.drawings.map((d) => (d.id === id ? summary : d))
          : c.drawings.filter((d) => d.id !== id),
      }))
    } catch (error) {
      console.error('Could not move the drawing', error)
      setNotice('Couldn’t move the drawing. Try again.')
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
      importing={importing}
      imported={imported}
      onImport={(file) => void onImport(file)}
      onDismissImport={() => setImported(undefined)}
      onRename={(id, name) => void onRename(id, name)}
      folderId={folderId}
      view={view}
      onTrash={(id) => void onTrash(id)}
      onRestore={(id) => void onRestore(id)}
      onDeleteForever={(id) => void onDeleteForever(id)}
      onEmptyTrash={() => void onEmptyTrash()}
      onSaveFolder={(values, existing) => void onSaveFolder(values, existing)}
      onDeleteFolder={(folder) => void onDeleteFolder(folder)}
      onMove={(id, target) => void onMove(id, target)}
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

/** What an import left out, shown before the new drawing opens. */
export interface ImportedDrawing {
  id: string
  imported: number
  lines: string[]
}

export interface HomeViewProps {
  repository: DrawingRepository
  imageCache: ImageCache
  list: HomeList
  sort: DrawingSort
  onSort(sort: DrawingSort): void
  creating: boolean
  onCreate(): void
  importing?: boolean
  imported?: ImportedDrawing
  onImport?(file: File): void
  onDismissImport?(): void
  onRename(id: string, name: string): void
  /** The folder the route names; one that doesn't exist shows All drawings. */
  folderId?: string
  /** `trash` replaces the cards with the Trash screen (ADR 0046). */
  view?: 'drawings' | 'trash'
  onSaveFolder(values: FolderValues, existing?: Folder): void
  onDeleteFolder(folder: Folder): void
  onMove(id: string, folderId: string | null): void
  onTrash(id: string): void
  onRestore(id: string): void
  onDeleteForever(id: string): void
  onEmptyTrash(): void
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
  importing = false,
  imported,
  onImport,
  onDismissImport,
  onRename,
  folderId,
  view = 'drawings',
  onSaveFolder,
  onDeleteFolder,
  onMove,
  onTrash,
  onRestore,
  onDeleteForever,
  onEmptyTrash,
  onRetry,
  notice,
  now,
}: HomeViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const loaded = list.status === 'loaded' ? list : undefined
  const folders = loaded?.folders ?? []
  const current = activeFolder(folders, folderId)
  // A route that names a folder that is gone shows All drawings, and says so.
  const inTrash = view === 'trash'
  const folderGone =
    loaded !== undefined && folderId !== undefined && !current && !inTrash
  const message =
    notice ?? (folderGone ? 'That folder doesn’t exist any more.' : undefined)
  return (
    <div className="home">
      <Sidebar
        folders={folders}
        counts={folderCounts(loaded?.drawings ?? [])}
        total={loaded?.drawings.length}
        selectedId={inTrash ? undefined : current?.id}
        trashCount={loaded?.trashed.length}
        trashSelected={inTrash}
        onSaveFolder={onSaveFolder}
        onDeleteFolder={onDeleteFolder}
      />
      <div className="home-content">
        <header className="home-header">
          <SettingsMenu />
        </header>
        <main className="home-main">
          <div className="home-title-row">
            <h1>
              {inTrash ? 'Trash' : current ? current.name : 'All drawings'}
            </h1>
            {!inTrash && (
              <>
                <button
                  type="button"
                  className="button"
                  disabled={importing}
                  onClick={() => fileInput.current?.click()}
                >
                  {importing ? 'Importing…' : 'Import file'}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".yodo,.excalidraw,.json,application/json"
                  hidden
                  aria-label="File to import"
                  data-testid="import-file"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) onImport?.(file)
                  }}
                />
                <label className="home-sort">
                  Sort by
                  <select
                    value={sort}
                    onChange={(event) =>
                      onSort(event.target.value as DrawingSort)
                    }
                  >
                    {SORTS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {message && (
            <p className="home-notice" role="alert">
              {message}
            </p>
          )}
          {imported && (
            <section className="import-summary" aria-label="Import summary">
              <p>
                Imported {imported.imported}{' '}
                {imported.imported === 1 ? 'element' : 'elements'}. Some things
                changed on the way:
              </p>
              <ul>
                {imported.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="import-summary-actions">
                <a className="button-primary" href={`#/d/${imported.id}`}>
                  Open drawing
                </a>
                <button
                  type="button"
                  className="button"
                  onClick={onDismissImport}
                >
                  Dismiss
                </button>
              </div>
            </section>
          )}
          {list.status === 'error' ? (
            <div className="home-error" role="alert">
              <p>Couldn’t load your drawings.</p>
              <button type="button" className="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : inTrash ? (
            loaded && (
              <TrashView
                trashed={loaded.trashed}
                now={now}
                onRestore={onRestore}
                onDeleteForever={onDeleteForever}
                onEmptyTrash={onEmptyTrash}
              />
            )
          ) : (
            <ul className="card-grid" aria-busy={list.status === 'loading'}>
              <li>
                <button
                  type="button"
                  className="new-drawing-tile"
                  // On a folder route the drawing belongs in that folder, which is only
                  // known once the folders have loaded.
                  disabled={
                    creating ||
                    (folderId !== undefined && list.status === 'loading')
                  }
                  onClick={onCreate}
                >
                  <Plus size={28} />
                  New drawing
                </button>
              </li>
              {loaded &&
                sortDrawings(
                  drawingsInView(loaded.drawings, current?.id),
                  sort,
                ).map((summary) => (
                  <DrawingCard
                    key={summary.id}
                    summary={summary}
                    repository={repository}
                    imageCache={imageCache}
                    now={now}
                    folders={folders}
                    showFolder={current === undefined}
                    onRename={(name) => onRename(summary.id, name)}
                    onMove={(target) => onMove(summary.id, target)}
                    onTrash={() => onTrash(summary.id)}
                  />
                ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}
