// The self-hosted DrawingRepository: one request per method against the Go
// server's /api/drawings routes (ADR 0030). The server stores the document as
// opaque JSON and sets the timestamps itself.

import { migrate } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { safeSearchText } from '../core/search/extract.ts'
import type {
  DrawingRepository,
  DrawingSummary,
  SearchIndexEntry,
} from './repository.ts'

/** The header that carries a drawing's canvas text on save (ADR 0047). */
export const SEARCH_TEXT_HEADER = 'X-Yodo-Search-Text'
/**
 * Longest percent-encoded text sent in the header. Proxies commonly cap a
 * header near 8 KB, so longer text goes to `PUT …/search-text` instead.
 */
export const MAX_HEADER_TEXT = 6000
/** The most characters sent to `PUT …/search-text`; 4 bytes each is 1 MiB. */
const MAX_INDEX_CHARS = 256 * 1024
/** Documents fetched at once while backfilling the index. */
const BACKFILL_BATCH = 4

function clampIndexText(text: string): string {
  if (text.length <= MAX_INDEX_CHARS) return text
  const cut = text.slice(0, MAX_INDEX_CHARS)
  // Do not leave half of a surrogate pair at the end.
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}

/** A response with a status the API doesn't promise for that call. */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * `JSON.stringify`, but throws instead of silently changing the data: on
 * functions and symbols (IndexedDB refuses them too, with DataCloneError, so a
 * bad save fails the same way in both modes; ADR 0031), and on non-finite
 * numbers and undefined array entries, which JSON would turn into `null`.
 */
export function toStrictJson(value: unknown): string {
  return JSON.stringify(value, function (this: unknown, key, v: unknown) {
    if (typeof v === 'function' || typeof v === 'symbol') {
      throw new TypeError(`Cannot serialize a ${typeof v} at "${key}"`)
    }
    // JSON writes these as null, so they would load back changed. (An
    // undefined object property is dropped, which reads back the same.)
    if (typeof v === 'number' && !Number.isFinite(v)) {
      throw new TypeError(`Cannot serialize ${v} at "${key}"`)
    }
    if (v === undefined && Array.isArray(this)) {
      throw new TypeError(`Cannot serialize undefined at index ${key}`)
    }
    return v
  })
}

/**
 * Sends one request under the app root and throws HttpError unless the status
 * is one of `expected`. Shared by the drawing and folder repositories.
 */
export async function sendRequest(
  fetch: typeof globalThis.fetch,
  baseUrl: URL,
  method: string,
  path: string,
  expected: number[],
  init: RequestInit = {},
): Promise<Response> {
  // Relative, so the API is found under /yodo/ as well as at / (ADR 0007).
  const url = new URL(path, baseUrl)
  const response = await fetch(url, { ...init, method })
  if (!expected.includes(response.status)) {
    const body = await response.text().catch(() => '')
    throw new HttpError(
      response.status,
      `${method} ${url.pathname} failed with ${response.status}: ${body.trim()}`,
    )
  }
  return response
}

/**
 * URL parsing collapses "." and ".." segments, escaped or not, so these ids
 * would reach another route. App-made ids are UUIDs (ADR 0013).
 */
export function pathSegment(kind: string, id: string): string {
  if (id === '.' || id === '..') {
    throw new TypeError(`A ${kind} id can't be "${id}" over HTTP`)
  }
  return encodeURIComponent(id)
}

export interface HttpRepositoryOptions {
  /** The app root the API lives under, e.g. `new URL('./', document.baseURI)`. */
  baseUrl: URL
  /** Injected so tests can add the `Origin` header a browser sends itself. */
  fetch?: typeof globalThis.fetch
}

export class HttpDrawingRepository implements DrawingRepository {
  readonly #baseUrl: URL
  readonly #fetch: typeof globalThis.fetch

  constructor({ baseUrl, fetch = globalThis.fetch }: HttpRepositoryOptions) {
    this.#baseUrl = baseUrl
    // Bound, because calling an unbound `window.fetch` throws "Illegal invocation".
    this.#fetch = fetch.bind(globalThis)
  }

  async #request(
    method: string,
    path: string,
    expected: number[],
    init: RequestInit = {},
  ): Promise<Response> {
    return sendRequest(this.#fetch, this.#baseUrl, method, path, expected, init)
  }

  #drawingPath(id: string): string {
    return `api/drawings/${pathSegment('drawing', id)}`
  }

  async list(): Promise<DrawingSummary[]> {
    const response = await this.#request('GET', 'api/drawings', [200])
    return (await response.json()) as DrawingSummary[]
  }

  async listTrash(): Promise<DrawingSummary[]> {
    const response = await this.#request(
      'GET',
      'api/drawings?trashed=true',
      [200],
    )
    return (await response.json()) as DrawingSummary[]
  }

  async get(id: string): Promise<YodoDocument | undefined> {
    const response = await this.#request(
      'GET',
      this.#drawingPath(id),
      [200, 404],
    )
    if (response.status === 404) return undefined
    // Migrated like every other source (ADR 0013).
    return migrate(await response.json())
  }

  async save(doc: YodoDocument): Promise<DrawingSummary> {
    // Serialized before the request, so a bad document never reaches the server.
    const body = toStrictJson(doc)
    const text = safeSearchText(doc)
    const encoded = encodeURIComponent(text)
    // Text that fits goes in the same request, so the index and the document
    // change together. Longer text follows in a second request (ADR 0047).
    const fits = encoded.length <= MAX_HEADER_TEXT
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (fits) headers[SEARCH_TEXT_HEADER] = encoded
    const response = await this.#request(
      'PUT',
      this.#drawingPath(doc.id),
      [200],
      { headers, body },
    )
    const summary = (await response.json()) as DrawingSummary
    if (!fits) {
      // The document is saved; a failure here leaves the drawing unindexed
      // (NULL), which the next searchIndex() repairs, so it must not fail the save.
      await this.#putSearchText(doc.id, text, false).catch(() => {})
    }
    return summary
  }

  async #putSearchText(
    id: string,
    text: string,
    onlyIfUnset: boolean,
  ): Promise<void> {
    const query = onlyIfUnset ? '?ifUnset=true' : ''
    await this.#request(
      'PUT',
      `${this.#drawingPath(id)}/search-text${query}`,
      [204, 404],
      {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: clampIndexText(text),
      },
    )
  }

  async searchIndex(): Promise<SearchIndexEntry[]> {
    const response = await this.#request('GET', 'api/search-index', [200])
    const rows = (await response.json()) as {
      id: string
      searchText: string | null
    }[]
    const entries: SearchIndexEntry[] = rows.map((row) => ({
      id: row.id,
      searchText: row.searchText ?? '',
    }))
    // Drawings saved before search existed have no text on the server yet.
    // Index them now from their documents (ADR 0047).
    const unindexed = rows.flatMap((row, at) =>
      row.searchText === null ? [at] : [],
    )
    for (let i = 0; i < unindexed.length; i += BACKFILL_BATCH) {
      await Promise.all(
        unindexed.slice(i, i + BACKFILL_BATCH).map(async (at) => {
          const entry = entries[at]!
          const doc = await this.get(entry.id).catch(() => undefined)
          if (!doc) return
          entry.searchText = safeSearchText(doc)
          // ifUnset: a save that landed meanwhile has the newer text.
          await this.#putSearchText(entry.id, entry.searchText, true).catch(
            () => {},
          )
        }),
      )
    }
    return entries
  }

  async move(
    id: string,
    folderId: string | null,
  ): Promise<DrawingSummary | undefined> {
    // 400 (an unknown folder) throws HttpError; only a missing drawing is quiet.
    const response = await this.#request(
      'PUT',
      `${this.#drawingPath(id)}/folder`,
      [200, 404],
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      },
    )
    if (response.status === 404) return undefined
    return (await response.json()) as DrawingSummary
  }

  async #setTrashed(
    id: string,
    trashed: boolean,
  ): Promise<DrawingSummary | undefined> {
    const response = await this.#request(
      'PUT',
      `${this.#drawingPath(id)}/trash`,
      [200, 404],
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed }),
      },
    )
    if (response.status === 404) return undefined
    return (await response.json()) as DrawingSummary
  }

  trash(id: string): Promise<DrawingSummary | undefined> {
    return this.#setTrashed(id, true)
  }

  restore(id: string): Promise<DrawingSummary | undefined> {
    return this.#setTrashed(id, false)
  }

  async emptyTrash({
    deletedBefore,
  }: { deletedBefore?: number } = {}): Promise<void> {
    const cutoff =
      deletedBefore === undefined
        ? ''
        : `&deletedBefore=${Math.trunc(deletedBefore)}`
    await this.#request('DELETE', `api/drawings?trashed=true${cutoff}`, [204])
  }

  async delete(id: string): Promise<void> {
    await this.#request('DELETE', this.#drawingPath(id), [204])
  }
}
