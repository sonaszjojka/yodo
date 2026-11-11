// The standalone backend (ADR 0064): one `.yodo` file per drawing in a
// directory, with the repository's metadata in the file's `meta` section, so
// a single atomic rename writes a drawing and its metadata together. Drawings
// in Trash live in `.trash/`; folders are scoped out.

import { randomUUID } from 'node:crypto'
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  parseYodoFile,
  serializeYodoFile,
  type YodoFiles,
} from '../../web/src/core/document/file.ts'
import type { YodoDocument } from '../../web/src/core/document/types.ts'
import { safeSearchText } from '../../web/src/core/search/extract.ts'
import {
  RevisionConflictError,
  type DrawingRepository,
  type DrawingSummary,
  type SaveOptions,
  type SearchIndexEntry,
} from '../../web/src/storage/repository.ts'

const EXTENSION = '.yodo'
const TRASH = '.trash'
/** Keeps `<name>.yodo` and a temp name well under the usual 255-byte limit. */
const MAX_NAME_BYTES = 200

/** The metadata a `.yodo` file carries in its `meta` section. */
interface Meta {
  createdAt: number
  updatedAt: number
  revision: number
  deletedAt?: number
}

interface Entry {
  doc: YodoDocument
  files: YodoFiles
  meta: Meta
  trashed: boolean
}

const KEEP = /^[a-z0-9-]$/
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/**
 * The file name for an id: every byte outside `[a-z0-9-]` as `%XX`. It is
 * reversible, holds no path separator or dot segment, and is plain ASCII in
 * one case, so ids that differ only in case don't collide on case-insensitive
 * file systems. Undefined for an id with no usable name.
 */
export function fileNameFor(id: string): string | undefined {
  // A lone surrogate has no UTF-8 form: the encoder would turn it into U+FFFD,
  // and two different ids would share one file.
  if (LONE_SURROGATE.test(id)) return undefined
  let name = ''
  for (const byte of new TextEncoder().encode(id)) {
    const char = String.fromCharCode(byte)
    name += KEEP.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  if (name === '' || name.length > MAX_NAME_BYTES) return undefined
  return name
}

/** The id a file name stands for, or undefined if it isn't one `fileNameFor` makes. */
export function idFor(fileName: string): string | undefined {
  if (!fileName.endsWith(EXTENSION)) return undefined
  const name = fileName.slice(0, -EXTENSION.length)
  const bytes: number[] = []
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '%') {
      const hex = name.slice(i + 1, i + 3)
      if (!/^[0-9A-F]{2}$/.test(hex)) return undefined
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(name.charCodeAt(i))
    }
  }
  let id: string
  try {
    // `ignoreBOM` keeps a leading U+FEFF, which is part of the id.
    id = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      new Uint8Array(bytes),
    )
  } catch {
    return undefined
  }
  // Only the canonical spelling counts, so one id has exactly one file.
  return fileNameFor(id) === name ? id : undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isMeta(value: unknown): value is Meta {
  if (typeof value !== 'object' || value === null) return false
  const meta = value as Record<string, unknown>
  return (
    isFiniteNumber(meta.createdAt) &&
    isFiniteNumber(meta.updatedAt) &&
    Number.isSafeInteger(meta.revision) &&
    (meta.revision as number) >= 1 &&
    (meta.deletedAt === undefined || isFiniteNumber(meta.deletedAt))
  )
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function summaryOf({ doc, meta, trashed }: Entry): DrawingSummary {
  const summary: DrawingSummary = {
    id: doc.id,
    name: doc.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
  }
  if (trashed && meta.deletedAt !== undefined) {
    summary.deletedAt = meta.deletedAt
  }
  return summary
}

export interface FileRepositoryOptions {
  /** `YODO_MCP_DIR`; created on the first write. */
  dir: string
  now?: () => number
  /** Reports a file it skips. Defaults to stderr: stdout is the MCP protocol. */
  warn?: (message: string) => void
}

export class FileDrawingRepository implements DrawingRepository {
  readonly #dir: string
  readonly #now: () => number
  readonly #warn: (message: string) => void
  /** Every call runs after the one before, so a check and its write are one step. */
  #tail: Promise<unknown> = Promise.resolve()

  constructor({
    dir,
    now = Date.now,
    warn = (message) => console.error(`yodo-mcp: ${message}`),
  }: FileRepositoryOptions) {
    this.#dir = dir
    this.#now = now
    this.#warn = warn
  }

  #run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(task)
    this.#tail = result.catch(() => {})
    return result
  }

  #livePath(name: string): string {
    return join(this.#dir, name + EXTENSION)
  }

  #trashPath(name: string): string {
    return join(this.#dir, TRASH, name + EXTENSION)
  }

  /** Reads one file; undefined when it is missing or unusable (with a warning). */
  async #readFile(
    path: string,
    id: string,
    trashed: boolean,
  ): Promise<Entry | undefined> {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
    let parsed: ReturnType<typeof parseYodoFile>
    try {
      parsed = parseYodoFile(text)
    } catch (error) {
      this.#warn(`skipping ${path}: ${(error as Error).message}`)
      return undefined
    }
    const { document: doc, files } = parsed
    if (doc.id !== id) {
      this.#warn(`skipping ${path}: it holds drawing ${doc.id}`)
      return undefined
    }
    let meta: Meta
    if (parsed.meta === undefined) {
      // An app export dropped into the folder: a drawing nobody saved here yet.
      const time = Math.round((await stat(path)).mtimeMs)
      meta = { createdAt: time, updatedAt: time, revision: 1 }
      if (trashed) meta.deletedAt = time
    } else if (isMeta(parsed.meta)) {
      meta = { ...parsed.meta }
      if (trashed) meta.deletedAt ??= meta.updatedAt
      else delete meta.deletedAt
    } else {
      this.#warn(`skipping ${path}: its meta section is malformed`)
      return undefined
    }
    return { doc, files, meta, trashed }
  }

  /** The drawing as stored; the copy in Trash wins if a crash left both. */
  async #entry(id: string): Promise<Entry | undefined> {
    const name = fileNameFor(id)
    if (name === undefined) return undefined
    return (
      (await this.#readFile(this.#trashPath(name), id, true)) ??
      (await this.#readFile(this.#livePath(name), id, false))
    )
  }

  async #ids(dir: string): Promise<string[]> {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    // Temp files and anything else that isn't `<name>.yodo` are not drawings.
    return names.flatMap((fileName) => {
      const id = idFor(fileName)
      return id === undefined ? [] : [id]
    })
  }

  async #trashed(): Promise<Entry[]> {
    const ids = await this.#ids(join(this.#dir, TRASH))
    const entries = await Promise.all(
      ids.map((id) =>
        this.#readFile(this.#trashPath(fileNameFor(id)!), id, true),
      ),
    )
    return entries.filter((entry) => entry !== undefined)
  }

  async #live(): Promise<Entry[]> {
    const inTrash = new Set((await this.#trashed()).map(({ doc }) => doc.id))
    const ids = (await this.#ids(this.#dir)).filter((id) => !inTrash.has(id))
    const entries = await Promise.all(
      ids.map((id) =>
        this.#readFile(this.#livePath(fileNameFor(id)!), id, false),
      ),
    )
    return entries.filter((entry) => entry !== undefined)
  }

  /** Temp file in the target's directory, then a rename: never half a file. */
  async #writeAtomic(target: string, text: string): Promise<void> {
    const dir = dirname(target)
    await mkdir(dir, { recursive: true })
    const temp = join(dir, `.tmp-${randomUUID()}`)
    try {
      const handle = await open(temp, 'wx')
      try {
        await handle.writeFile(text, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temp, target)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
  }

  async #write(entry: Entry): Promise<void> {
    const name = fileNameFor(entry.doc.id)!
    const meta: Meta = { ...entry.meta }
    if (!entry.trashed) delete meta.deletedAt
    await this.#writeAtomic(
      entry.trashed ? this.#trashPath(name) : this.#livePath(name),
      serializeYodoFile(entry.doc, entry.files, meta),
    )
  }

  list(): Promise<DrawingSummary[]> {
    return this.#run(async () => (await this.#live()).map(summaryOf))
  }

  listTrash(): Promise<DrawingSummary[]> {
    return this.#run(async () => (await this.#trashed()).map(summaryOf))
  }

  searchIndex(): Promise<SearchIndexEntry[]> {
    return this.#run(async () =>
      (await this.#live()).map(({ doc }) => ({
        id: doc.id,
        searchText: safeSearchText(doc),
      })),
    )
  }

  get(id: string): Promise<YodoDocument | undefined> {
    return this.#run(async () => (await this.#entry(id))?.doc)
  }

  getWithRevision(
    id: string,
  ): Promise<{ doc: YodoDocument; revision: number } | undefined> {
    return this.#run(async () => {
      const entry = await this.#entry(id)
      return entry && { doc: entry.doc, revision: entry.meta.revision }
    })
  }

  getRevision(id: string): Promise<number | undefined> {
    return this.#run(async () => (await this.#entry(id))?.meta.revision)
  }

  save(
    doc: YodoDocument,
    { expectedRevision }: SaveOptions = {},
  ): Promise<DrawingSummary> {
    return this.#run(async () => {
      if (fileNameFor(doc.id) === undefined) {
        throw new Error(
          `Drawing id ${JSON.stringify(doc.id)} can't be a file name`,
        )
      }
      // Throws for a document that can't be stored, before anything is written.
      const clone = structuredClone(doc)
      const existing = await this.#entry(doc.id)
      if (
        expectedRevision !== undefined &&
        existing?.meta.revision !== expectedRevision
      ) {
        throw new RevisionConflictError(doc.id, existing?.meta.revision)
      }
      const time = this.#now()
      const meta: Meta = {
        createdAt: existing?.meta.createdAt ?? time,
        updatedAt: time,
        revision: (existing?.meta.revision ?? 0) + 1,
      }
      const trashed = existing?.trashed ?? false
      // Auto-save must not bring a trashed drawing back (ADR 0046).
      if (trashed) meta.deletedAt = existing!.meta.deletedAt
      // The images come from the stored file; one it doesn't have is an error
      // from `serializeYodoFile`, so nothing is written.
      const entry: Entry = {
        doc: clone,
        files: existing?.files ?? {},
        meta,
        trashed,
      }
      await this.#write(entry)
      return summaryOf(entry)
    })
  }

  move(
    id: string,
    folderId: string | null,
  ): Promise<DrawingSummary | undefined> {
    return this.#run(async () => {
      const existing = await this.#entry(id)
      if (!existing) return undefined
      // Folders are scoped out (ADR 0064), so every folder is missing.
      if (folderId !== null)
        throw new Error(`Folder ${folderId} does not exist`)
      return summaryOf(existing)
    })
  }

  trash(id: string): Promise<DrawingSummary | undefined> {
    return this.#run(async () => {
      const existing = await this.#entry(id)
      if (!existing) return undefined
      if (existing.trashed) return summaryOf(existing)
      const entry: Entry = {
        ...existing,
        meta: { ...existing.meta, deletedAt: this.#now() },
        trashed: true,
      }
      // The Trash copy first: if we stop here, it wins over the live one.
      await this.#write(entry)
      await rm(this.#livePath(fileNameFor(id)!), { force: true })
      return summaryOf(entry)
    })
  }

  restore(id: string): Promise<DrawingSummary | undefined> {
    return this.#run(async () => {
      const existing = await this.#entry(id)
      if (!existing) return undefined
      if (!existing.trashed) return summaryOf(existing)
      const entry: Entry = { ...existing, trashed: false }
      // The live copy first: if we stop here, the drawing is still in Trash.
      await this.#write(entry)
      await rm(this.#trashPath(fileNameFor(id)!), { force: true })
      return summaryOf(entry)
    })
  }

  emptyTrash({
    deletedBefore,
  }: { deletedBefore?: number } = {}): Promise<void> {
    return this.#run(async () => {
      for (const { doc, meta } of await this.#trashed()) {
        if (deletedBefore !== undefined && meta.deletedAt! >= deletedBefore) {
          continue
        }
        await this.#remove(fileNameFor(doc.id)!)
      }
    })
  }

  delete(id: string): Promise<void> {
    return this.#run(async () => {
      const name = fileNameFor(id)
      if (name !== undefined) await this.#remove(name)
    })
  }

  /** The live copy first, the Trash copy last, so a stop never revives it. */
  async #remove(name: string): Promise<void> {
    await rm(this.#livePath(name), { force: true })
    await rm(this.#trashPath(name), { force: true })
  }
}
