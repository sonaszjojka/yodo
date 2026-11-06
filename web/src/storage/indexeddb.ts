// The hosted-mode DrawingRepository, stored in the browser's IndexedDB through
// the `idb` promise wrapper (ADR 0005).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { migrate } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import type { RepositoryOptions } from './memory.ts'
import type { Folder, FolderInput, FolderRepository } from './folders.ts'
import { sha256Hex, type ImageRepository } from './images.ts'
import type { DrawingRepository, DrawingSummary } from './repository.ts'

/** Database names start with `yodo-` (ADR 0005). */
export const DEFAULT_DB_NAME = 'yodo-data'

// Bump together with a new step in `upgrade`; never edit a released step.
const DB_VERSION = 3

// Summaries and documents live in separate stores so `list()` reads only the
// small summaries, never every drawing's elements.
interface YodoDb extends DBSchema {
  drawings: { key: string; value: DrawingSummary }
  documents: { key: string; value: YodoDocument }
  /** Image blobs by content hash (ADR 0040). Bytes, not a Blob, so every browser clones them the same way. */
  blobs: { key: string; value: StoredBlob }
  /** Folders (ADR 0045). A drawing's summary names its folder in `folderId`. */
  folders: { key: string; value: Folder }
}

interface StoredBlob {
  hash: string
  type: string
  bytes: ArrayBuffer
}

export interface IndexedDbRepositoryOptions extends RepositoryOptions {
  dbName?: string
}

/**
 * One lazily opened connection to the Yodo database, shared by the drawing and
 * image repositories. Reopens after the browser or another tab closes it.
 */
class YodoDbConnection {
  readonly #dbName: string
  #db: Promise<IDBPDatabase<YodoDb>> | undefined

  constructor(dbName: string) {
    this.#dbName = dbName
  }

  /** Opens the database on first use and reuses the connection after that. */
  open(): Promise<IDBPDatabase<YodoDb>> {
    if (this.#db) return this.#db
    const forget = () => {
      if (this.#db === opening) this.#db = undefined
    }
    const opening = openDB<YodoDb>(this.#dbName, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('drawings', { keyPath: 'id' })
          db.createObjectStore('documents', { keyPath: 'id' })
        }
        // Existing drawings are untouched (ADR 0040).
        if (oldVersion < 2) {
          db.createObjectStore('blobs', { keyPath: 'hash' })
        }
        // Existing drawings simply have no folder (ADR 0045).
        if (oldVersion < 3) {
          db.createObjectStore('folders', { keyPath: 'id' })
        }
      },
      // Another tab wants a newer schema: close so its upgrade isn't blocked.
      // The next call here opens again (and gets the new version).
      blocking: () => {
        forget()
        void opening.then((db) => db.close())
      },
      // The browser closed the connection (e.g. storage cleared).
      terminated: forget,
    })
    // A failed open shouldn't stick; the next call tries again.
    opening.catch(forget)
    this.#db = opening
    return opening
  }
}

export class IndexedDbDrawingRepository implements DrawingRepository {
  readonly #now: () => number
  readonly #connection: YodoDbConnection

  constructor({
    now = Date.now,
    dbName = DEFAULT_DB_NAME,
  }: IndexedDbRepositoryOptions = {}) {
    this.#now = now
    this.#connection = new YodoDbConnection(dbName)
  }

  #open() {
    return this.#connection.open()
  }

  async list(): Promise<DrawingSummary[]> {
    const db = await this.#open()
    // Summaries are small and a trashed drawing is rare, so filtering here
    // beats an index (and needs no schema change, ADR 0046).
    return (await db.getAll('drawings')).filter(
      (s) => s.deletedAt === undefined,
    )
  }

  async listTrash(): Promise<DrawingSummary[]> {
    const db = await this.#open()
    return (await db.getAll('drawings')).filter(
      (s) => s.deletedAt !== undefined,
    )
  }

  async get(id: string): Promise<YodoDocument | undefined> {
    const db = await this.#open()
    const doc = await db.get('documents', id)
    return doc && migrate(doc)
  }

  async save(doc: YodoDocument): Promise<DrawingSummary> {
    const db = await this.#open()
    // One transaction, so the summary and document never disagree and two
    // saves of the same drawing can't interleave between read and write.
    const tx = db.transaction(['drawings', 'documents'], 'readwrite')
    const drawings = tx.objectStore('drawings')
    const existing = await drawings.get(doc.id)
    const time = this.#now()
    const summary: DrawingSummary = {
      id: doc.id,
      name: doc.name,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    }
    // Auto-save must not undo a move (ADR 0045).
    if (existing?.folderId !== undefined) summary.folderId = existing.folderId
    // Auto-save must not bring a trashed drawing back (ADR 0046).
    if (existing?.deletedAt !== undefined)
      summary.deletedAt = existing.deletedAt
    const pending: Promise<unknown>[] = [tx.done]
    try {
      pending.push(drawings.put(summary))
      pending.push(tx.objectStore('documents').put(doc))
    } catch (error) {
      // put() throws synchronously for a value it can't clone. That is not a
      // failed request, so the transaction would commit the summary alone.
      tx.abort()
      // Aborting rejects the queued requests and tx.done with AbortError;
      // `error` is the real cause, so only it reaches the caller.
      for (const request of pending) request.catch(() => {})
      throw error
    }
    await Promise.all(pending)
    return summary
  }

  async move(
    id: string,
    folderId: string | null,
  ): Promise<DrawingSummary | undefined> {
    const db = await this.#open()
    const tx = db.transaction(['drawings', 'folders'], 'readwrite')
    const existing = await tx.objectStore('drawings').get(id)
    if (!existing) {
      await tx.done
      return undefined
    }
    if (folderId !== null && !(await tx.objectStore('folders').get(folderId))) {
      tx.abort()
      tx.done.catch(() => {})
      throw new Error(`Folder ${folderId} does not exist`)
    }
    const { folderId: _old, ...rest } = existing
    const summary: DrawingSummary =
      folderId === null ? rest : { ...rest, folderId }
    await Promise.all([tx.objectStore('drawings').put(summary), tx.done])
    return summary
  }

  async trash(id: string): Promise<DrawingSummary | undefined> {
    const db = await this.#open()
    const tx = db.transaction('drawings', 'readwrite')
    const existing = await tx.store.get(id)
    if (!existing) {
      await tx.done
      return undefined
    }
    const summary = {
      ...existing,
      deletedAt: existing.deletedAt ?? this.#now(),
    }
    await Promise.all([tx.store.put(summary), tx.done])
    return summary
  }

  async restore(id: string): Promise<DrawingSummary | undefined> {
    const db = await this.#open()
    const tx = db.transaction('drawings', 'readwrite')
    const existing = await tx.store.get(id)
    if (!existing) {
      await tx.done
      return undefined
    }
    const { deletedAt: _deleted, ...summary } = existing
    await Promise.all([tx.store.put(summary), tx.done])
    return summary
  }

  async emptyTrash({
    deletedBefore,
  }: { deletedBefore?: number } = {}): Promise<void> {
    const db = await this.#open()
    // One transaction reads the summaries and deletes the matching ones, so
    // nothing restored or trashed again in between is removed (ADR 0046).
    const tx = db.transaction(['drawings', 'documents'], 'readwrite')
    const drawings = tx.objectStore('drawings')
    const documents = tx.objectStore('documents')
    const removals: Promise<unknown>[] = [tx.done]
    for (const { id, deletedAt } of await drawings.getAll()) {
      if (deletedAt === undefined) continue
      if (deletedBefore !== undefined && deletedAt >= deletedBefore) continue
      removals.push(drawings.delete(id), documents.delete(id))
    }
    await Promise.all(removals)
  }

  async delete(id: string): Promise<void> {
    const db = await this.#open()
    const tx = db.transaction(['drawings', 'documents'], 'readwrite')
    await Promise.all([
      tx.objectStore('drawings').delete(id),
      tx.objectStore('documents').delete(id),
      tx.done,
    ])
  }
}

/** The hosted-mode FolderRepository, in the same database as the drawings (ADR 0045). */
export class IndexedDbFolderRepository implements FolderRepository {
  readonly #now: () => number
  readonly #connection: YodoDbConnection

  constructor({
    now = Date.now,
    dbName = DEFAULT_DB_NAME,
  }: IndexedDbRepositoryOptions = {}) {
    this.#now = now
    this.#connection = new YodoDbConnection(dbName)
  }

  async list(): Promise<Folder[]> {
    const db = await this.#connection.open()
    return db.getAll('folders')
  }

  async save(input: FolderInput): Promise<Folder> {
    const db = await this.#connection.open()
    const tx = db.transaction('folders', 'readwrite')
    const existing = await tx.store.get(input.id)
    const folder: Folder = {
      id: input.id,
      name: input.name,
      icon: input.icon,
      color: input.color,
      createdAt: existing?.createdAt ?? this.#now(),
    }
    await Promise.all([tx.store.put(folder), tx.done])
    return folder
  }

  async delete(id: string): Promise<void> {
    const db = await this.#connection.open()
    // One transaction, so a folder never outlives its drawings' move to Trash
    // or the reverse. Drawings have no folder index, so this scans the
    // summaries (ADR 0045). A drawing already in Trash keeps its deletedAt.
    const tx = db.transaction(['folders', 'drawings'], 'readwrite')
    const drawings = tx.objectStore('drawings')
    const removals: Promise<unknown>[] = [tx.objectStore('folders').delete(id)]
    for (const summary of await drawings.getAll()) {
      if (summary.folderId !== id) continue
      const { folderId: _folder, ...rest } = summary
      removals.push(
        drawings.put({ ...rest, deletedAt: summary.deletedAt ?? this.#now() }),
      )
    }
    await Promise.all([...removals, tx.done])
  }
}

/** The hosted-mode ImageRepository: blobs by content hash in IndexedDB (ADR 0040). */
export class IndexedDbImageRepository implements ImageRepository {
  readonly #connection: YodoDbConnection

  constructor({
    dbName = DEFAULT_DB_NAME,
  }: Pick<IndexedDbRepositoryOptions, 'dbName'> = {}) {
    this.#connection = new YodoDbConnection(dbName)
  }

  async put(blob: Blob): Promise<string> {
    const bytes = await blob.arrayBuffer()
    const hash = await sha256Hex(bytes)
    const db = await this.#connection.open()
    // Same bytes, same key: writing again is harmless, so no read first.
    await db.put('blobs', { hash, type: blob.type, bytes })
    return hash
  }

  async get(hash: string): Promise<Blob | undefined> {
    const db = await this.#connection.open()
    const stored = await db.get('blobs', hash)
    return stored && new Blob([stored.bytes], { type: stored.type })
  }

  async has(hash: string): Promise<boolean> {
    const db = await this.#connection.open()
    return (await db.count('blobs', hash)) > 0
  }
}
