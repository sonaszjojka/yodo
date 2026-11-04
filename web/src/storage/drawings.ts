// What the Home screen and the editor route do with drawings (ADR 0033), on top
// of `DrawingRepository`. Framework-free, so it's tested without React.

import { createDocument } from '../core/document/create.ts'
import type { YodoDocument } from '../core/document/types.ts'
import type { DrawingRepository, DrawingSummary } from './repository.ts'

export type LoadResult =
  | { status: 'loaded'; document: YodoDocument }
  | { status: 'not-found' }
  | { status: 'error'; error: unknown }

export interface LoadOptions {
  /**
   * A save to wait for first, e.g. the editor that just closed: over HTTP a
   * read could otherwise overtake it and return the older document.
   */
  after?: Promise<unknown>
}

/**
 * Opens one drawing for the editor. A failure is reported, never replaced by
 * a new drawing, so nothing gets saved over or around the stored one (#67).
 */
export async function loadDrawing(
  repository: DrawingRepository,
  id: string,
  { after }: LoadOptions = {},
): Promise<LoadResult> {
  try {
    await after
    const document = await repository.get(id)
    return document ? { status: 'loaded', document } : { status: 'not-found' }
  } catch (error) {
    return { status: 'error', error }
  }
}

/** Saves a new, empty drawing and returns its id, so a reload finds it. */
export async function createDrawing(
  repository: DrawingRepository,
): Promise<string> {
  const document = createDocument()
  await repository.save(document)
  return document.id
}

/**
 * Renames a stored drawing; the name is trimmed. Resolves undefined, changing
 * nothing, for an empty name or a missing drawing. It saves the whole
 * document, so `updatedAt` moves: a rename counts as an edit.
 */
export async function renameDrawing(
  repository: DrawingRepository,
  id: string,
  name: string,
): Promise<DrawingSummary | undefined> {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const document = await repository.get(id)
  if (!document) return undefined
  return repository.save({ ...document, name: trimmed })
}

export type DrawingSort = 'recent' | 'name' | 'created'

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

const COMPARE: Record<
  DrawingSort,
  (a: DrawingSummary, b: DrawingSummary) => number
> = {
  recent: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  name: (a, b) => collator.compare(a.name, b.name),
}

/** A sorted copy; ties fall back to the id, so the order never flickers. */
export function sortDrawings(
  summaries: readonly DrawingSummary[],
  by: DrawingSort,
): DrawingSummary[] {
  return summaries.toSorted(
    (a, b) => COMPARE[by](a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
