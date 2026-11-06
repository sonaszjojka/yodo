// The self-hosted FolderRepository: one request per method against the Go
// server's /api/folders routes (ADR 0045).

import type { Folder, FolderInput, FolderRepository } from './folders.ts'
import {
  pathSegment,
  sendRequest,
  toStrictJson,
  type HttpRepositoryOptions,
} from './http.ts'

export class HttpFolderRepository implements FolderRepository {
  readonly #baseUrl: URL
  readonly #fetch: typeof globalThis.fetch

  constructor({ baseUrl, fetch = globalThis.fetch }: HttpRepositoryOptions) {
    this.#baseUrl = baseUrl
    // Bound, because calling an unbound `window.fetch` throws "Illegal invocation".
    this.#fetch = fetch.bind(globalThis)
  }

  async list(): Promise<Folder[]> {
    const response = await sendRequest(
      this.#fetch,
      this.#baseUrl,
      'GET',
      'api/folders',
      [200],
    )
    return (await response.json()) as Folder[]
  }

  async save(input: FolderInput): Promise<Folder> {
    const { id, name, icon, color } = input
    const response = await sendRequest(
      this.#fetch,
      this.#baseUrl,
      'PUT',
      `api/folders/${pathSegment('folder', id)}`,
      [200],
      {
        headers: { 'Content-Type': 'application/json' },
        body: toStrictJson({ id, name, icon, color }),
      },
    )
    return (await response.json()) as Folder
  }

  async delete(id: string): Promise<void> {
    await sendRequest(
      this.#fetch,
      this.#baseUrl,
      'DELETE',
      `api/folders/${pathSegment('folder', id)}`,
      [204],
    )
  }
}
