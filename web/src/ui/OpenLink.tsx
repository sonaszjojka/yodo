import { useEffect, useRef, useState } from 'react'
import type { ImageRepository } from '../storage/images.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import type { ImageCache } from './imageCache.ts'
import {
  createOpener,
  openLinkErrorMessage,
  readOpenLink,
  type Opener,
  type OpenLinkRead,
} from './openLink.ts'
import { navigate, routeHash } from './route.ts'
import { importFile } from './yodoFile.ts'

export interface OpenLinkViewProps {
  /** Undefined while the link is being read. */
  read?: OpenLinkRead
  importing: boolean
  /** Why the last Open failed, if it did. */
  importError?: string
  onOpen(): void
  onCancel(): void
}

/** The `#/open/<data>` screen (ADR 0069): confirm first, never import silently. */
export function OpenLinkView({
  read,
  importing,
  importError,
  onOpen,
  onCancel,
}: OpenLinkViewProps) {
  if (!read) {
    return (
      <p className="screen-message" role="status">
        Opening link…
      </p>
    )
  }
  if (read.status === 'error') {
    return (
      <main className="screen-message" role="alert">
        <h1>Couldn’t open this link</h1>
        <p>{read.message}</p>
        <div className="screen-message-actions">
          <a className="button" href={routeHash({ name: 'home' })}>
            Back to Home
          </a>
        </div>
      </main>
    )
  }
  return (
    <main className="screen-message">
      <h1>Open this drawing?</h1>
      <p>
        <strong>{read.name}</strong>
        {' · '}
        {read.elementCount === 1
          ? '1 element'
          : `${read.elementCount} elements`}
      </p>
      <p>It will be added to your drawings as a new copy.</p>
      {importError && <p role="alert">{importError}</p>}
      <div className="screen-message-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onOpen}
          disabled={importing}
        >
          {importing ? 'Opening…' : 'Open'}
        </button>
        <button
          type="button"
          className="button"
          onClick={onCancel}
          disabled={importing}
        >
          Cancel
        </button>
      </div>
    </main>
  )
}

export interface OpenLinkProps {
  data: string
  repository: DrawingRepository
  images: ImageRepository
  imageCache: ImageCache
  /** The closing editor's last save, which the import must not overtake. */
  waitForEditor(): Promise<boolean>
}

/** Reads the link, asks, then imports it through the file-import path. */
export function OpenLink({
  data,
  repository,
  images,
  imageCache,
  waitForEditor,
}: OpenLinkProps) {
  const [read, setRead] = useState<OpenLinkRead>()
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string>()
  // This mount's opener and whether it's still mounted. Made in the effect, so
  // a slow import from an unmounted screen never navigates or sets state.
  const session = useRef<{ open: Opener; isActive(): boolean }>(undefined)

  useEffect(() => {
    let active = true
    void readOpenLink(data).then((result) => {
      if (active) setRead(result)
    })
    session.current = {
      open: createOpener({
        waitForEditor,
        importText: (text) => importFile(repository, images, imageCache, text),
        isCurrent: () =>
          active && window.location.hash === routeHash({ name: 'open', data }),
        show: (id) => navigate({ name: 'drawing', id }, { replace: true }),
      }),
      isActive: () => active,
    }
    return () => {
      active = false
    }
  }, [data, repository, images, imageCache, waitForEditor])

  async function onOpen() {
    const current = session.current
    if (read?.status !== 'ready' || !current) return
    setImporting(true)
    setImportError(undefined)
    try {
      await current.open(read.text)
    } catch (error) {
      console.error('Could not import the link', error)
      if (current.isActive()) setImportError(openLinkErrorMessage(error))
    }
    if (current.isActive()) setImporting(false)
  }

  return (
    <OpenLinkView
      read={read}
      importing={importing}
      importError={importError}
      onOpen={() => void onOpen()}
      onCancel={() => navigate({ name: 'home' }, { replace: true })}
    />
  )
}
