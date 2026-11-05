// The behaviour every ImageRepository must share (ADR 0011, 0040). Each
// implementation's test file calls `describeImageContract`; this file is not a
// test file itself.

import { beforeEach, describe, expect, test } from 'vitest'
import type { ImageRepository } from './images.ts'

/** A real 1x1 transparent PNG, and the SHA-256 of exactly these bytes. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=='

export function pngBlob(): Blob {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: 'image/png' })
}

async function bytesOf(blob: Blob) {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

export function describeImageContract(
  name: string,
  makeRepository: () => ImageRepository | Promise<ImageRepository>,
): void {
  describe(`${name} (ImageRepository contract)`, () => {
    let repo: ImageRepository

    beforeEach(async () => {
      repo = await makeRepository()
    })

    test('stores an image under the hash of its bytes', async () => {
      const blob = pngBlob()
      const hash = await repo.put(blob)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      const stored = await repo.get(hash)
      expect(stored?.type).toBe('image/png')
      expect(await bytesOf(stored!)).toEqual(await bytesOf(blob))
      expect(await repo.has(hash)).toBe(true)
    })

    test('storing the same bytes twice gives the same hash', async () => {
      expect(await repo.put(pngBlob())).toBe(await repo.put(pngBlob()))
    })

    test('does not know a hash that was never stored', async () => {
      const unknown = '0'.repeat(64)
      expect(await repo.get(unknown)).toBeUndefined()
      expect(await repo.has(unknown)).toBe(false)
    })
  })
}
