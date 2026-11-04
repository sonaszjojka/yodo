import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDrawing, type LoadResult } from '../storage/drawings.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import { App } from './App.tsx'
import { DrawingLoadError } from './DrawingLoadError.tsx'
import { Home } from './Home.tsx'
import { useRoute } from './route.ts'

/** Picks the screen from the hash route (ADR 0033). */
export function Root({ repository }: { repository: DrawingRepository }) {
  const route = useRoute()
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
      waitForEditor={waitForEditor}
      lastSaveFailed={lastSaveFailed}
    />
  ) : (
    <DrawingScreen
      key={route.id}
      repository={repository}
      id={route.id}
      waitForEditor={waitForEditor}
      onClose={onClose}
    />
  )
}

interface DrawingScreenProps {
  repository: DrawingRepository
  id: string
  /** The previous editor's last save, which the load must not overtake. */
  waitForEditor(): Promise<boolean>
  onClose(saved: Promise<boolean>): void
}

/** Loads the drawing, then opens the editor on it; never a blank fallback. */
function DrawingScreen({
  repository,
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
    <App repository={repository} document={result.document} onClose={onClose} />
  )
}
