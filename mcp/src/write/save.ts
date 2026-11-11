// One write: read the drawing, apply a change, save it only if nobody saved in
// between (ADR 0062, 0066). A conflict is reported, never retried: the
// agent's change may rest on a version it no longer sees.

import type { YodoDocument } from '../../../web/src/core/document/types.ts'
import {
  RevisionConflictError,
  type DrawingRepository,
} from '../../../web/src/storage/repository.ts'
import type { Applied } from './apply.ts'

export type Written =
  { drawingId: string; revision: number; ids: string[] } | { error: string }

export function notFound(id: string): { error: string } {
  return {
    error: `No drawing with id ${JSON.stringify(id)}. Call list_drawings or search_drawings for ids.`,
  }
}

function conflict(
  id: string,
  expected: number,
  current: number | undefined,
): { error: string } {
  const now =
    current === undefined
      ? 'it no longer exists'
      : `it is now at revision ${current}`
  return {
    error:
      `Drawing ${JSON.stringify(id)} changed since revision ${expected} (${now}). ` +
      'Call get_drawing again and retry with the new revision.',
  }
}

/**
 * Applies `change` to the stored drawing and saves it at the revision the
 * agent read (`revision`, from get_drawing), or else at the one just loaded.
 */
export async function writeDrawing(
  repo: DrawingRepository,
  drawingId: string,
  revision: number | undefined,
  change: (doc: YodoDocument) => Applied,
): Promise<Written> {
  const found = await repo.getWithRevision(drawingId)
  if (!found) return notFound(drawingId)
  const expected = revision ?? found.revision
  if (expected !== found.revision) {
    return conflict(drawingId, expected, found.revision)
  }
  const applied = change(found.doc)
  if ('error' in applied) return applied
  try {
    const saved = await repo.save(applied.doc, { expectedRevision: expected })
    return { drawingId, revision: saved.revision, ids: applied.ids }
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return conflict(drawingId, expected, error.currentRevision)
    }
    throw error
  }
}

/** A new drawing: its id is fresh, so there is nothing to conflict with. */
export async function createDrawing(
  repo: DrawingRepository,
  doc: YodoDocument,
  change: (doc: YodoDocument) => Applied,
): Promise<Written> {
  const applied = change(doc)
  if ('error' in applied) return applied
  const saved = await repo.save(applied.doc)
  return { drawingId: doc.id, revision: saved.revision, ids: applied.ids }
}
