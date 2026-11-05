import type { SyntheticEvent } from 'react'
import type { UnlockResult } from '../storage/session.ts'

/** The message under the field for a refused password, or for no answer at all. */
export function unlockError(
  result: UnlockResult | 'failed',
): string | undefined {
  switch (result) {
    case 'ok':
      return undefined
    case 'wrong':
      return 'Wrong password.'
    case 'throttled':
      return 'Too many wrong passwords. Wait a minute and try again.'
    case 'failed':
      return 'Could not reach the server. Try again.'
  }
}

/**
 * Keeps the keys and clipboard events typed into the password dialog away from
 * the editor behind it, which listens on `window` (Canvas.tsx): Delete, undo
 * and paste there would change a drawing nobody can see.
 */
export function keepFromEditor(event: SyntheticEvent) {
  event.stopPropagation()
}

/** The events the editor listens to on `window` (Canvas.tsx). */
export const EDITOR_WINDOW_EVENTS = [
  'keydown',
  'keyup',
  'copy',
  'cut',
  'paste',
  'wheel',
  // Safari's pinch zoom.
  'gesturestart',
  'gesturechange',
] as const

/**
 * While the password dialog is open, keeps those events from reaching the
 * editor behind it, wherever they start: the backdrop, the body, or anywhere
 * else outside the dialog. (Events inside the dialog are stopped by its own
 * handlers, which leave the field working.) The listeners are in the capture
 * phase, so they run before the editor's own on `window`. Returns the cleanup.
 */
export function guardEditor(
  win: EventTarget,
  isInsideDialog: (target: EventTarget | null) => boolean,
): () => void {
  const block = (event: Event) => {
    if (!isInsideDialog(event.target)) event.stopImmediatePropagation()
  }
  for (const type of EDITOR_WINDOW_EVENTS)
    win.addEventListener(type, block, { capture: true })
  return () => {
    for (const type of EDITOR_WINDOW_EVENTS) {
      win.removeEventListener(type, block, { capture: true })
    }
  }
}
