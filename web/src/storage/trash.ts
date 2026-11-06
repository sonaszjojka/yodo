// Trash retention (ADR 0046). The sweep runs on the client, the same way in
// both modes, when Home loads; the server keeps no timer.

import type { DrawingRepository } from './repository.ts'

/** How long a drawing stays in Trash before it is deleted for good. */
export const TRASH_RETENTION_DAYS = 30

/** `TRASH_RETENTION_DAYS` in milliseconds. */
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** When a drawing trashed at `deletedAt` is deleted for good. */
export function expiresAt(deletedAt: number): number {
  return deletedAt + TRASH_RETENTION_MS
}

/**
 * Deletes the drawings trashed more than 30 days before `now`. One
 * conditional call, so a drawing restored in another tab is never removed by a
 * stale sweep. A failure is logged and ignored: the sweep must never keep Home
 * from loading, and the next visit tries again.
 */
export async function purgeExpiredTrash(
  repository: DrawingRepository,
  now: number,
): Promise<void> {
  try {
    await repository.emptyTrash({ deletedBefore: now - TRASH_RETENTION_MS })
  } catch (error) {
    console.error('Could not purge the expired drawings from Trash', error)
  }
}
