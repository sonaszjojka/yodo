import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '../storage/session.ts'
import { loadDrawing, type LoadResult } from '../storage/drawings.ts'
import type { ImageRepository } from '../storage/images.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import { App } from './App.tsx'
import { DrawingLoadError } from './DrawingLoadError.tsx'
import { Home } from './Home.tsx'
import { createImageCache, type ImageCache } from './imageCache.ts'
import { useRoute } from './route.ts'

/** Picks the screen from the hash route (ADR 0033). */
export function Root({
  repository,
  images,
  session,
}: {
  repository: DrawingRepository
  images: ImageRepository
  /** The server's password, if it has one (ADR 0020). */
  session?: Session
}) {
  const route = useRoute()
  // One cache for the whole app, so a picture decoded in the editor is ready
  // for Home's thumbnails (ADR 0040).
  const imageCache = useMemo(() => createImageCache(images), [images])
  // Pictures that failed with 401 while the session was over load again once
  // the password was entered.
  useEffect(
    () => session?.onUnlocked(() => imageCache.retryMissing()),
    [session, imageCache],
  )
  // The closing editor's last save. React runs the old screen's cleanup before
  // the new screen's effects, so the next screen's first read can wait for it:
  // Home's list(), or the editor's get() after Back then Forward.
  const closing = useRef<Promise<boolean>>(Promise.resolve(true))
  const waitForEditor = useCallback(() => closing.current, [])
  // Kept here, not on Home, so it survives Home remounting.
  const [lastSaveFailed, setLastSaveFailed] = useState(false)
  const onClose = useCallback((saved: Promise<boolean>) => {
    closing.current = saved
    void saved.then((ok) => setLastSaveFailed(!ok))
  }, [])

  return route.name === 'home' ? (
    <Home
      repository={repository}
      images={images}
      imageCache={imageCache}
      waitForEditor={waitForEditor}
      lastSaveFailed={lastSaveFailed}
    />
  ) : (
    <DrawingScreen
      key={route.id}
      repository={repository}
      images={images}
      imageCache={imageCache}
      id={route.id}
      waitForEditor={waitForEditor}
      onClose={onClose}
    />
  )
}

interface DrawingScreenProps {
  repository: DrawingRepository
  images: ImageRepository
  imageCache: ImageCache
  id: string
  /** The previous editor's last save, which the load must not overtake. */
  waitForEditor(): Promise<boolean>
  onClose(saved: Promise<boolean>): void
}

/** Loads the drawing, then opens the editor on it; never a blank fallback. */
function DrawingScreen({
  repository,
  images,
  imageCache,
  id,
  waitForEditor,
  onClose,
}: DrawingScreenProps) {
  const [result, setResult] = useState<LoadResult>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const after = waitForEditor()
    void loadDrawing(repository, id, { after }).then((loaded) => {
      if (loaded.status === 'error') {
        console.error('Could not open the drawing', loaded.error)
      }
      if (!cancelled) setResult(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [repository, id, waitForEditor, attempt])

  if (!result) {
    return (
      <p className="screen-message" role="status">
        Opening…
      </p>
    )
  }
  if (result.status !== 'loaded') {
    return (
      <DrawingLoadError
        kind={result.status}
        onRetry={() => {
          setResult(undefined)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  return (
    <App
      repository={repository}
      images={images}
      imageCache={imageCache}
      document={result.document}
      onClose={onClose}
    />
  )
}
