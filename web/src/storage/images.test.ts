import { describe, expect, test } from 'vitest'
import { describeImageContract, pngBlob } from './imageContract.ts'
import {
  ImageError,
  MAX_IMAGE_BYTES,
  ingestImage,
  sha256Fallback,
  sha256Hex,
} from './images.ts'
import { InMemoryImageRepository } from './memoryImages.ts'

describeImageContract(
  'InMemoryImageRepository',
  () => new InMemoryImageRepository(),
)

const VECTORS: [string, string][] = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
]

describe('sha256', () => {
  test.each(VECTORS)('fallback hashes %j', (text, expected) => {
    expect(sha256Fallback(new TextEncoder().encode(text))).toBe(expected)
  })

  test('fallback matches crypto.subtle on a long input', async () => {
    const bytes = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 31) % 256)
    expect(sha256Fallback(bytes)).toBe(await sha256Hex(bytes.buffer))
  })
})

describe('ingestImage', () => {
  const decode = async () => ({ width: 30, height: 20 })

  test('stores the image and returns its id and natural size', async () => {
    const repo = new InMemoryImageRepository()
    const result = await ingestImage(pngBlob(), repo, { decode })
    expect(result).toEqual({
      fileId: await repo.put(pngBlob()),
      width: 30,
      height: 20,
    })
  })

  test.each([
    ['an unsupported type', new Blob(['x'], { type: 'image/svg+xml' })],
    ['a non-image', new Blob(['x'], { type: 'text/plain' })],
    [
      'an oversize file',
      new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' }),
    ],
  ])('rejects %s without storing', async (_name, file) => {
    const repo = new InMemoryImageRepository()
    await expect(ingestImage(file, repo, { decode })).rejects.toBeInstanceOf(
      ImageError,
    )
    expect(await repo.has(await sha256Hex(await file.arrayBuffer()))).toBe(
      false,
    )
  })

  test('rejects bytes that do not decode', async () => {
    const repo = new InMemoryImageRepository()
    const broken = async () => {
      throw new Error('bad image')
    }
    await expect(
      ingestImage(pngBlob(), repo, { decode: broken }),
    ).rejects.toThrow(ImageError)
    expect(await repo.has(await sha256Hex(await pngBlob().arrayBuffer()))).toBe(
      false,
    )
  })
})
