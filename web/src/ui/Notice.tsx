import { useEffect } from 'react'

/** How long a notice stays, in milliseconds. */
export const NOTICE_MS = 5000

export interface NoticeProps {
  message: string | undefined
  /** Called when the notice times out or is closed. */
  onDismiss(): void
}

/** A short message over the canvas, for something that failed (not the drawing's own state). */
export function Notice({ message, onDismiss }: NoticeProps) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null
  return (
    <p className="notice" role="status">
      {message}
    </p>
  )
}
