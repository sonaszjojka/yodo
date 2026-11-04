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
  // the new screen's effects, so Home's first list() can wait for it.
  const closing = useRef<Promise<void>>(Promise.resolve())
  const waitForEditor = useCallback(() => closing.current, [])
  const onClose = useCallback((saved: Promise<void>) => {
    closing.current = saved
  }, [])

  return route.name === 'home' ? (
    <Home repository={repository} waitForEditor={waitForEditor} />
  ) : (
    <DrawingScreen
      key={route.id}
      repository={repository}
      id={route.id}
      onClose={onClose}
    />
  )
}

interface DrawingScreenProps {
  repository: DrawingRepository
  id: string
  onClose(saved: Promise<void>): void
}

/** Loads the drawing, then opens the editor on it; never a blank fallback. */
function DrawingScreen({ repository, id, onClose }: DrawingScreenProps) {
  const [result, setResult] = useState<LoadResult>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void loadDrawing(repository, id).then((loaded) => {
      if (loaded.status === 'error') {
        console.error('Could not open the drawing', loaded.error)
      }
      if (!cancelled) setResult(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [repository, id, attempt])

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
