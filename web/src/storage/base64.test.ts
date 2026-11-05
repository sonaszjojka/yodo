import { expect, test } from 'vitest'
import { base64ToBlob, blobToBase64 } from './base64.ts'

test('round-trips bytes of every value, across several chunks', async () => {
  const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)
  const blob = new Blob([bytes], { type: 'image/png' })

  const text = await blobToBase64(blob)
  const back = base64ToBlob(text, 'image/png')

  expect(back.type).toBe('image/png')
  expect([...new Uint8Array(await back.arrayBuffer())]).toEqual([...bytes])
})

test('encodes as standard padded base64', async () => {
  expect(await blobToBase64(new Blob(['hi']))).toBe('aGk=')
})
