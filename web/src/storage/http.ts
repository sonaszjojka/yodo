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
 * `JSON.stringify`, but throws on functions and symbols instead of silently
 * turning them into `null` or dropping them. IndexedDB refuses them too
 * (DataCloneError), so a bad save fails the same way in both modes (ADR 0031).
 */
export function toStrictJson(value: unknown): string {
  return JSON.stringify(value, (key, v: unknown) => {
    if (typeof v === 'function' || typeof v === 'symbol') {
      throw new TypeError(`Cannot serialize a ${typeof v} at "${key}"`)
    }
    return v
  })
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

  /** Sends the request and throws HttpError unless the status is expected. */
  async #request(
    method: string,
    path: string,
    expected: number[],
    init: RequestInit = {},
  ): Promise<Response> {
    // Relative, so the API is found under /yodo/ as well as at / (ADR 0007).
    const url = new URL(path, this.#baseUrl)
    const response = await this.#fetch(url, { ...init, method })
    if (!expected.includes(response.status)) {
      const body = await response.text().catch(() => '')
      throw new HttpError(
        response.status,
        `${method} ${url.pathname} failed with ${response.status}: ${body.trim()}`,
      )
    }
    return response
  }

  #drawingPath(id: string): string {
    return `api/drawings/${encodeURIComponent(id)}`
  }

  async list(): Promise<DrawingSummary[]> {
    const response = await this.#request('GET', 'api/drawings', [200])
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

  async delete(id: string): Promise<void> {
    await this.#request('DELETE', this.#drawingPath(id), [204])
  }
}
