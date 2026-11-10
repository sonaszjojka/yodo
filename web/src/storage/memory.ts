// The DrawingRepository and FolderRepository kept in memory, for tests and as
// the simplest reference implementation of the contract (ADR 0005).

import { migrate } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { safeSearchText } from '../core/search/extract.ts'
import type { Folder, FolderInput, FolderRepository } from './folders.ts'
import {
  RevisionConflictError,
  type DrawingRepository,
  type DrawingSummary,
  type SaveOptions,
  type SearchIndexEntry,
} from './repository.ts'

export interface RepositoryOptions {
  /** Clock for the save timestamps, in epoch milliseconds. */
  now?: () => number
}

/** What the two in-memory repositories share, so a folder delete reaches drawings. */
export class MemoryData {
  readonly summaries = new Map<string, DrawingSummary>()
  readonly documents = new Map<string, YodoDocument>()
  /** Canvas text by drawing id (ADR 0047). */
  readonly searchTexts = new Map<string, string>()
  readonly folders = new Map<string, Folder>()
}

export interface MemoryOptions extends RepositoryOptions {
  data?: MemoryData
}

export class InMemoryDrawingRepository implements DrawingRepository {
  readonly #now: () => number
  readonly #summaries: Map<string, DrawingSummary>
  readonly #documents: Map<string, YodoDocument>
  readonly #searchTexts: Map<string, string>
  readonly #folders: Map<string, Folder>

  constructor({ now = Date.now, data = new MemoryData() }: MemoryOptions = {}) {
    this.#now = now
    this.#summaries = data.summaries
    this.#documents = data.documents
    this.#searchTexts = data.searchTexts
    this.#folders = data.folders
  }

  // async so that a throw (e.g. structuredClone's DataCloneError) rejects the
  // promise, as the interface promises, instead of escaping synchronously.
  async list(): Promise<DrawingSummary[]> {
    return [...this.#summaries.values()]
      .filter((s) => s.deletedAt === undefined)
      .map((s) => ({ ...s }))
  }

  async listTrash(): Promise<DrawingSummary[]> {
    return [...this.#summaries.values()]
      .filter((s) => s.deletedAt !== undefined)
      .map((s) => ({ ...s }))
  }

  async searchIndex(): Promise<SearchIndexEntry[]> {
    return [...this.#summaries.values()]
      .filter((s) => s.deletedAt === undefined)
      .map((s) => ({ id: s.id, searchText: this.#searchTexts.get(s.id) ?? '' }))
  }

  async get(id: string): Promise<YodoDocument | undefined> {
    const doc = this.#documents.get(id)
    // Cloned, like IndexedDB's structured clone, so callers can't change the
    // stored copy; migrated like every other source (ADR 0013).
    return doc && migrate(structuredClone(doc))
  }

  async getWithRevision(
    id: string,
  ): Promise<{ doc: YodoDocument; revision: number } | undefined> {
    // Both read in one synchronous step, so no save can land between them.
    const doc = this.#documents.get(id)
    const summary = this.#summaries.get(id)
    if (!doc || !summary) return undefined
    return { doc: migrate(structuredClone(doc)), revision: summary.revision }
  }

  async getRevision(id: string): Promise<number | undefined> {
    return this.#summaries.get(id)?.revision
  }

  async save(
    doc: YodoDocument,
    { expectedRevision }: SaveOptions = {},
  ): Promise<DrawingSummary> {
    const time = this.#now()
    const existing = this.#summaries.get(doc.id)
    // Checked before anything is written (ADR 0062).
    if (
      expectedRevision !== undefined &&
      existing?.revision !== expectedRevision
    ) {
      throw new RevisionConflictError(doc.id, existing?.revision)
    }
    const summary: DrawingSummary = {
      id: doc.id,
      name: doc.name,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
      revision: (existing?.revision ?? 0) + 1,
    }
    if (existing?.folderId !== undefined) summary.folderId = existing.folderId
    // Auto-save must not bring a trashed drawing back (ADR 0046).
    if (existing?.deletedAt !== undefined)
      summary.deletedAt = existing.deletedAt
    const clone = structuredClone(doc)
    this.#documents.set(doc.id, clone)
    // Indexing must never block a save (ADR 0047).
    this.#searchTexts.set(doc.id, safeSearchText(clone))
    this.#summaries.set(doc.id, summary)
    return { ...summary }
  }

  async move(
    id: string,
    folderId: string | null,
  ): Promise<DrawingSummary | undefined> {
    const existing = this.#summaries.get(id)
    if (!existing) return undefined
    if (folderId !== null && !this.#folders.has(folderId)) {
      throw new Error(`Folder ${folderId} does not exist`)
    }
    const { folderId: _old, ...rest } = existing
    const summary: DrawingSummary =
      folderId === null ? rest : { ...rest, folderId }
    this.#summaries.set(id, summary)
    return { ...summary }
  }

  async trash(id: string): Promise<DrawingSummary | undefined> {
    const existing = this.#summaries.get(id)
    if (!existing) return undefined
    const summary = {
      ...existing,
      deletedAt: existing.deletedAt ?? this.#now(),
    }
    this.#summaries.set(id, summary)
    return { ...summary }
  }

  async restore(id: string): Promise<DrawingSummary | undefined> {
    const existing = this.#summaries.get(id)
    if (!existing) return undefined
    const { deletedAt: _deleted, ...summary } = existing
    this.#summaries.set(id, summary)
    return { ...summary }
  }

  async emptyTrash({
    deletedBefore,
  }: { deletedBefore?: number } = {}): Promise<void> {
    for (const [id, { deletedAt }] of this.#summaries) {
      if (deletedAt === undefined) continue
      if (deletedBefore !== undefined && deletedAt >= deletedBefore) continue
      this.#summaries.delete(id)
      this.#documents.delete(id)
      this.#searchTexts.delete(id)
    }
  }

  async delete(id: string): Promise<void> {
    this.#documents.delete(id)
    this.#searchTexts.delete(id)
    this.#summaries.delete(id)
  }
}

export class InMemoryFolderRepository implements FolderRepository {
  readonly #now: () => number
  readonly #data: MemoryData

  constructor({ now = Date.now, data = new MemoryData() }: MemoryOptions = {}) {
    this.#now = now
    this.#data = data
  }

  async list(): Promise<Folder[]> {
    return [...this.#data.folders.values()].map((f) => ({ ...f }))
  }

  async save(input: FolderInput): Promise<Folder> {
    const folder: Folder = {
      id: input.id,
      name: input.name,
      icon: input.icon,
      color: input.color,
      createdAt: this.#data.folders.get(input.id)?.createdAt ?? this.#now(),
    }
    this.#data.folders.set(folder.id, folder)
    return { ...folder }
  }

  async delete(id: string): Promise<void> {
    this.#data.folders.delete(id)
    // Its drawings go to Trash and leave the folder (ADR 0046); one already in
    // Trash keeps its deletedAt.
    for (const [drawingId, summary] of this.#data.summaries) {
      if (summary.folderId !== id) continue
      const { folderId: _folder, ...rest } = summary
      this.#data.summaries.set(drawingId, {
        ...rest,
        deletedAt: summary.deletedAt ?? this.#now(),
      })
    }
  }
}
