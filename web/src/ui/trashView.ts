// What the Trash screen shows (ADR 0046). Pure, so it is tested without React.

import { TRASH_RETENTION_DAYS } from '../storage/trash.ts'
import type { DrawingSummary } from '../storage/repository.ts'

/** The drawings in Trash, newest first; ties fall back to the id. */
export function sortTrash(
  trashed: readonly DrawingSummary[],
): DrawingSummary[] {
  return trashed.toSorted(
    (a, b) =>
      (b.deletedAt ?? 0) - (a.deletedAt ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/** The count in the bar above the list. */
export function trashCountText(count: number): string {
  if (count === 0) return 'Trash is empty'
  return count === 1 ? '1 drawing in Trash' : `${count} drawings in Trash`
}

/** The retention rule, shown next to the count. */
export const TRASH_RULE_TEXT = `Drawings are deleted forever after ${TRASH_RETENTION_DAYS} days.`

export function emptyTrashMessage(count: number): string {
  const drawings = count === 1 ? '1 drawing' : `${count} drawings`
  return `Delete ${drawings} in Trash forever? This can’t be undone.`
}

export function deleteForeverMessage(name: string): string {
  return `Delete “${name}” forever? This can’t be undone.`
}
