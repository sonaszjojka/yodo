// The pure part of Home's search (ADR 0047): what is searched, when the loaded
// index is stale, and the sections to show.

import {
  searchDrawings,
  type SearchIndexEntry,
  type SearchResults,
} from '../core/search/match.ts'
import { sortDrawings, type DrawingSort } from '../storage/drawings.ts'
import type { DrawingSummary } from '../storage/repository.ts'
import { drawingsInView } from './homeFolders.ts'

/** A query that is only spaces searches nothing. */
export function isSearching(query: string): boolean {
  return query.trim() !== ''
}

/**
 * The search index as Home holds it. `forList` is the drawing list it was read
 * for (no state yet means it is being read): a trash, restore, delete or import gives Home a new list, so an index
 * read for an older one may miss a drawing and is read again.
 */
export type SearchIndexState =
  | {
      status: 'ready'
      forList: readonly DrawingSummary[]
      entries: SearchIndexEntry[]
    }
  | { status: 'error'; forList: readonly DrawingSummary[] }

/** True unless `state` is a finished index for exactly this list. */
export function needsIndex(
  state: SearchIndexState | undefined,
  drawings: readonly DrawingSummary[],
): boolean {
  return !(state?.status === 'ready' && state.forList === drawings)
}

export interface SearchView {
  results: SearchResults<DrawingSummary>
  /** The canvas-text section is still waiting for the index. */
  textPending: boolean
  /** The index couldn't be read, so only names were searched. */
  textFailed: boolean
}

/**
 * Searches the drawings the current view lists (all drawings, or one folder).
 * Names match at once; canvas text once the index for this list is ready.
 * Both lists follow the Sort by control, like the card grid.
 */
export function searchView(
  drawings: readonly DrawingSummary[],
  folderId: string | undefined,
  index: SearchIndexState | undefined,
  query: string,
  sort: DrawingSort,
): SearchView {
  const inView = sortDrawings(drawingsInView(drawings, folderId), sort)
  const usable = index?.forList === drawings ? index : undefined
  const entries = usable?.status === 'ready' ? usable.entries : []
  return {
    results: searchDrawings(inView, entries, query),
    textPending: usable === undefined,
    textFailed: usable?.status === 'error',
  }
}
