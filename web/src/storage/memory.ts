// A DrawingRepository kept in memory, for tests and as the simplest reference
// implementation of the contract (ADR 0005).

import { migrate } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import type { DrawingRepository, DrawingSummary } from './repository.ts'

export interface RepositoryOptions {
  /** Clock for the save timestamps, in epoch milliseconds. */
  now?: () => number
}

export class InMemoryDrawingRepository implements DrawingRepository {
  readonly #now: () => number
  readonly #summaries = new Map<string, DrawingSummary>()
  readonly #documents = new Map<string, YodoDocument>()

  constructor({ now = Date.now }: RepositoryOptions = {}) {
    this.#now = now
  }

  list(): Promise<DrawingSummary[]> {
    return Promise.resolve([...this.#summaries.values()].map((s) => ({ ...s })))
  }

  get(id: string): Promise<YodoDocument | undefined> {
    const doc = this.#documents.get(id)
    // Cloned, like IndexedDB's structured clone, so callers can't change the
    // stored copy; migrated like every other source (ADR 0013).
    return Promise.resolve(doc && migrate(structuredClone(doc)))
  }

  save(doc: YodoDocument): Promise<DrawingSummary> {
    const time = this.#now()
    const summary: DrawingSummary = {
      id: doc.id,
      name: doc.name,
      createdAt: this.#summaries.get(doc.id)?.createdAt ?? time,
      updatedAt: time,
    }
    this.#documents.set(doc.id, structuredClone(doc))
    this.#summaries.set(doc.id, summary)
    return Promise.resolve({ ...summary })
  }

  delete(id: string): Promise<void> {
    this.#documents.delete(id)
    this.#summaries.delete(id)
    return Promise.resolve()
  }
}
