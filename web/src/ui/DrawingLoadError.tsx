import { routeHash } from './route.ts'

export interface DrawingLoadErrorProps {
  kind: 'not-found' | 'error'
  /** Shown with `kind: 'error'`. */
  onRetry?(): void
}

/**
 * What the editor route shows instead of a drawing that didn't load (ADR
 * 0033). It never falls back to a blank drawing.
 */
export function DrawingLoadError({ kind, onRetry }: DrawingLoadErrorProps) {
  return (
    <main className="screen-message" role="alert">
      <h1>
        {kind === 'not-found'
          ? 'Drawing not found'
          : 'Couldn’t open this drawing'}
      </h1>
      <p>
        {kind === 'not-found'
          ? 'It may have been deleted, or the link is wrong.'
          : 'The drawing is still stored. Check your connection or the server, then try again.'}
      </p>
      <div className="screen-message-actions">
        {kind === 'error' && (
          <button type="button" className="button-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <a className="button" href={routeHash({ name: 'home' })}>
          Back to Home
        </a>
      </div>
    </main>
  )
}
