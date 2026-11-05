// An ImageRepository kept in memory, for tests (ADR 0040).

import { sha256Hex, type ImageRepository } from './images.ts'

export class InMemoryImageRepository implements ImageRepository {
  readonly #blobs = new Map<string, Blob>()

  async put(blob: Blob): Promise<string> {
    const hash = await sha256Hex(await blob.arrayBuffer())
    this.#blobs.set(hash, blob)
    return hash
  }

  async get(hash: string): Promise<Blob | undefined> {
    return this.#blobs.get(hash)
  }

  async has(hash: string): Promise<boolean> {
    return this.#blobs.has(hash)
  }
}
