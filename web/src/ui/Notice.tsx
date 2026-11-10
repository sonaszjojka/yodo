import { useEffect } from 'react'

/** How long a notice stays, in milliseconds. */
export const NOTICE_MS = 5000

/** A link offered in a notice, e.g. "Open copy" (ADR 0062). */
export interface NoticeAction {
  label: string
  href: string
}

export interface NoticeProps {
  message: string | undefined
  /** `info` for news that is not a failure; `error` by default. */
  tone?: 'error' | 'info'
  action?: NoticeAction
  /** Called when the notice times out or is closed. */
  onDismiss(): void
}

/**
 * A short message over the canvas: something that failed, or news about the
 * drawing from elsewhere (ADR 0062). Not for the drawing's own save state.
 */
export function Notice({
  message,
  tone = 'error',
  action,
  onDismiss,
}: NoticeProps) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null
  return (
    <p
      className={tone === 'info' ? 'notice notice-info' : 'notice'}
      role="status"
    >
      {message}
      {action && (
        <>
          {' '}
          <a className="notice-action" href={action.href}>
            {action.label}
          </a>
        </>
      )}
    </p>
  )
}
