import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { imageSize } from './imageSize.ts'

function encoded(
  type: 'image/png' | 'image/jpeg' | 'image/webp',
  width: number,
  height: number,
) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#c2453d'
  ctx.fillRect(0, 0, width, height)
  return new Uint8Array(
    type === 'image/png' ? canvas.toBuffer(type) : canvas.toBuffer(type, 90),
  )
}

/** A GIF header and logical screen descriptor: all the size needs. */
function gif(width: number, height: number) {
  const bytes = new Uint8Array(13)
  bytes.set(new TextEncoder().encode('GIF89a'))
  new DataView(bytes.buffer).setUint16(6, width, true)
  new DataView(bytes.buffer).setUint16(8, height, true)
  return bytes
}

/** A RIFF/WEBP file holding one chunk of `body`. */
function webp(fourcc: string, body: number[]) {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
  return new Uint8Array([
    ...ascii('RIFF'),
    0,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii(fourcc),
    body.length,
    0,
    0,
    0,
    ...body,
  ])
}

describe('imageSize', () => {
  it.each([
    ['image/png', 37, 21],
    ['image/jpeg', 640, 3],
    ['image/webp', 300, 17],
  ] as const)('reads a real %s', (type, width, height) => {
    expect(imageSize(encoded(type, width, height))).toEqual({ width, height })
  })

  it('reads a GIF', () => {
    expect(imageSize(gif(500, 260))).toEqual({ width: 500, height: 260 })
  })

  it('reads a lossless WebP (VP8L)', () => {
    // 14 bits of width - 1, then 14 bits of height - 1, little-endian.
    const bits = (1000 - 1) | ((2000 - 1) << 14)
    const body = [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff]
    body.push((bits >>> 24) & 0xff)
    expect(imageSize(webp('VP8L', body))).toEqual({ width: 1000, height: 2000 })
  })

  it('reads an extended WebP (VP8X)', () => {
    // Flags and reserved bytes, then 24-bit width - 1 and height - 1.
    const body = [0, 0, 0, 0, 0x0f, 0x27, 0, 0x1f, 0x4e, 0]
    expect(imageSize(webp('VP8X', body))).toEqual({
      width: 10000,
      height: 20000,
    })
  })

  it('gives undefined for garbage, an empty file or a cut-off header', () => {
    expect(imageSize(new TextEncoder().encode('not an image'))).toBeUndefined()
    expect(imageSize(new Uint8Array())).toBeUndefined()
    expect(imageSize(encoded('image/png', 4, 4).slice(0, 20))).toBeUndefined()
    expect(imageSize(encoded('image/jpeg', 4, 4).slice(0, 30))).toBeUndefined()
    expect(imageSize(gif(1, 1).slice(0, 9))).toBeUndefined()
  })
})
