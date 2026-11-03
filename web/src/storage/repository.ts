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
}

export interface DrawingRepository {
  /** Every drawing's summary, in no particular order. Loads no documents. */
  list(): Promise<DrawingSummary[]>
  /** The document migrated to the current version (ADR 0013), or undefined. */
  get(id: string): Promise<YodoDocument | undefined>
  /** Inserts or replaces the drawing `doc.id`; keeps its `createdAt`. */
  save(doc: YodoDocument): Promise<DrawingSummary>
  /** Removes the drawing; removing a missing id is not an error. */
  delete(id: string): Promise<void>
}
