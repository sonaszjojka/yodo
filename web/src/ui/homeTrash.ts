// List updates for the Trash actions on Home (ADR 0046). Pure, so they are
// tested without React.

import type { DrawingSummary } from '../storage/repository.ts'

export interface DrawingLists {
  drawings: DrawingSummary[]
  trashed: DrawingSummary[]
}

/**
 * Both lists without the drawing `id`. A permanent delete removes it from the
 * cards too: a Restore that finishes while the Delete forever confirmation is
 * open puts it there first.
 */
export function withoutDrawing(lists: DrawingLists, id: string): DrawingLists {
  return {
    drawings: lists.drawings.filter((d) => d.id !== id),
    trashed: lists.trashed.filter((d) => d.id !== id),
  }
}
