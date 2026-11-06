// Every read and write of drawings goes through this interface (ADR 0005), so
// hosted (IndexedDB) and self-hosted (HTTP) mode behave the same. One shared
// contract suite (`contract.ts`) runs against each implementation (ADR 0011).

import type { YodoDocument } from '../core/document/types.ts'

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
}

export interface DrawingRepository {
  /** Every drawing's summary, in no particular order. Loads no documents. */
  list(): Promise<DrawingSummary[]>
  /** The document migrated to the current version (ADR 0013), or undefined. */
  get(id: string): Promise<YodoDocument | undefined>
  /**
   * Inserts or replaces the drawing `doc.id`; keeps its `createdAt` and its
   * folder. A drawing saved after its folder was deleted is simply re-created
   * outside any folder (ADR 0045).
   */
  save(doc: YodoDocument): Promise<DrawingSummary>
  /**
   * Puts the drawing into a folder, or out of any folder with null (ADR 0045).
   * Moving is not an edit: `updatedAt` and the document stay as they were.
   * Resolves undefined for a missing drawing; rejects for a missing folder.
   */
  move(id: string, folderId: string | null): Promise<DrawingSummary | undefined>
  /** Removes the drawing; removing a missing id is not an error. */
  delete(id: string): Promise<void>
}
