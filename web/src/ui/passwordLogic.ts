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
