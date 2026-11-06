// Every read and write of drawings goes through this interface (ADR 0005), so
// hosted (IndexedDB) and self-hosted (HTTP) mode behave the same. One shared
// contract suite (`contract.ts`) runs against each implementation (ADR 0011).

import type { YodoDocument } from '../core/document/types.ts'
import type { SearchIndexEntry } from '../core/search/match.ts'

export type { SearchIndexEntry }

/** A drawing's metadata, enough for the Home screen without its elements. */
export interface DrawingSummary {
  id: string
  name: string
  /** Epoch milliseconds of the first save. */
  createdAt: number
  /** Epoch milliseconds of the latest save. */
  updatedAt: number
  /** The folder it is in (ADR 0045); absent for a drawing in no folder. */
  folderId?: string
  /**
   * Epoch milliseconds when it was moved to Trash (ADR 0046); absent for a
   * live drawing.
   */
  deletedAt?: number
}

export interface DrawingRepository {
  /**
   * Every live drawing's summary (not those in Trash, ADR 0046), in no
   * particular order. Loads no documents.
   */
  list(): Promise<DrawingSummary[]>
  /** The summaries of the drawings in Trash, in no particular order. */
  listTrash(): Promise<DrawingSummary[]>
  /**
   * The canvas text of every live drawing, for search (ADR 0047): the text in
   * its `text` elements and shape labels, `''` for a drawing with none. Drawings
   * in Trash are left out, like in `list()`. Loads no documents. Matching is
   * `searchDrawings` in core, so both modes find the same things.
   */
  searchIndex(): Promise<SearchIndexEntry[]>
  /** The document migrated to the current version (ADR 0013), or undefined. */
  get(id: string): Promise<YodoDocument | undefined>
  /**
   * Inserts or replaces the drawing `doc.id`; keeps its `createdAt` and its
   * folder. A drawing saved after its folder was deleted is simply re-created
   * outside any folder (ADR 0045). A drawing in Trash stays there.
   */
  save(doc: YodoDocument): Promise<DrawingSummary>
  /**
   * Puts the drawing into a folder, or out of any folder with null (ADR 0045).
   * Moving is not an edit: `updatedAt` and the document stay as they were.
   * Resolves undefined for a missing drawing; rejects for a missing folder.
   */
  move(id: string, folderId: string | null): Promise<DrawingSummary | undefined>
  /**
   * Moves the drawing to Trash (ADR 0046). Like a move it is not an edit:
   * `updatedAt`, the folder and the document stay as they were. A drawing
   * already in Trash keeps its first `deletedAt`. Resolves undefined for a
   * missing drawing.
   */
  trash(id: string): Promise<DrawingSummary | undefined>
  /**
   * Takes the drawing out of Trash, back into its folder if it still has one.
   * Resolves undefined for a missing drawing; a live one is returned as it is.
   */
  restore(id: string): Promise<DrawingSummary | undefined>
  /**
   * Permanently removes the drawings in Trash, or with `deletedBefore` only
   * those trashed before that time (epoch ms). The check and the delete are one
   * step, so the retention sweep never removes a drawing that was restored or
   * trashed again meanwhile (ADR 0046).
   */
  emptyTrash(options?: { deletedBefore?: number }): Promise<void>
  /** Permanently removes the drawing, live or trashed; a missing id is not an error. */
  delete(id: string): Promise<void>
}
