// The self-hosted DrawingRepository: one request per method against the Go
// server's /api/drawings routes (ADR 0030). The server stores the document as
// opaque JSON and sets the timestamps itself.

import { migrate } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import type { DrawingRepository, DrawingSummary } from './repository.ts'

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
    const response = await this.#request(
      'PUT',
      this.#drawingPath(doc.id),
      [200],
      {
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    )
    return (await response.json()) as DrawingSummary
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
