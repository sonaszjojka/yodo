// The self-hosted ImageRepository: PUT and GET against the Go server's
// /api/images/{hash} routes (ADR 0040).

import { HttpError, type HttpRepositoryOptions } from './http.ts'
import { HASH_PATTERN, sha256Hex, type ImageRepository } from './images.ts'

export class HttpImageRepository implements ImageRepository {
  readonly #baseUrl: URL
  readonly #fetch: typeof globalThis.fetch

  constructor({ baseUrl, fetch = globalThis.fetch }: HttpRepositoryOptions) {
    this.#baseUrl = baseUrl
    // Bound, because calling an unbound `window.fetch` throws "Illegal invocation".
    this.#fetch = fetch.bind(globalThis)
  }

  #url(hash: string): URL {
    return new URL(`api/images/${hash}`, this.#baseUrl)
  }

  async put(blob: Blob): Promise<string> {
    const bytes = await blob.arrayBuffer()
    const hash = await sha256Hex(bytes)
    const url = this.#url(hash)
    const response = await this.#fetch(url, {
      method: 'PUT',
      body: bytes,
      // The server sniffs the real type; this only labels the request.
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    })
    if (response.status !== 204) {
      const body = await response.text().catch(() => '')
      throw new HttpError(
        response.status,
        `PUT ${url.pathname} failed with ${response.status}: ${body.trim()}`,
      )
    }
    return hash
  }

  async get(hash: string): Promise<Blob | undefined> {
    // A malformed hash can't be stored, and must not reach another route.
    if (!HASH_PATTERN.test(hash)) return undefined
    const url = this.#url(hash)
    const response = await this.#fetch(url)
    if (response.status === 404) return undefined
    if (response.status !== 200) {
      throw new HttpError(
        response.status,
        `GET ${url.pathname} failed with ${response.status}`,
      )
    }
    return response.blob()
  }

  async has(hash: string): Promise<boolean> {
    return (await this.get(hash)) !== undefined
  }
}
