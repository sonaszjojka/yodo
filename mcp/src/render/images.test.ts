import { describe, expect, it } from 'vitest'
import { createImage } from '../../../web/src/core/document/create.ts'
import type { ImageElement } from '../../../web/src/core/document/types.ts'
import { MAX_IMAGE_BYTES } from '../../../web/src/storage/images.ts'
import {
  IMAGE_LIMITS,
  type ImageRead,
  type ImageSource,
  loadSceneImages,
} from './images.ts'
import { solidPng } from './solidPng.ts'

function image(id: string, fileId: string, x = 0): ImageElement {
  const view = { x: 0, y: 0, width: 1000, height: 1000 }
  return { ...createImage(fileId, { width: 40, height: 40 }, view), id, x }
}

/** A source over fixed reads that records what it was asked for. */
function fake(reads: Record<string, ImageRead>) {
  const calls: string[] = []
  const opened: string[] = []
  const source: ImageSource = {
    async open(drawingId) {
      opened.push(drawingId)
      return async (fileId) => {
        calls.push(fileId)
        return reads[fileId]
      }
    },
  }
  return { source, calls, opened }
}

const png = (bytes = solidPng(4, 4)) => ({ bytes, mimeType: 'image/png' })

describe('loadSceneImages', () => {
  it('reads only the rendered images, each fileId once', async () => {
    const { source, calls, opened } = fake({ f1: png(), f2: png() })
    const loaded = await loadSceneImages(
      [image('a', 'f1'), image('b', 'f1'), image('c', 'f2')],
      source,
      'd',
      'png',
    )
    expect(opened).toEqual(['d'])
    expect(calls).toEqual(['f1', 'f2'])
    expect(loaded.count).toBe(3)
    expect(loaded.placeholders).toEqual([])
    expect(loaded.lookup('f1')).toBeDefined()
    expect(loaded.dataUri('f1')).toBeUndefined()
  })

  it('gives an SVG data URIs and no decoded pictures', async () => {
    const bytes = solidPng(4, 4)
    const loaded = await loadSceneImages(
      [image('a', 'f1')],
      fake({ f1: png(bytes) }).source,
      'd',
      'svg',
    )
    expect(loaded.dataUri('f1')).toBe(
      `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
    )
    expect(loaded.lookup('f1')).toBeUndefined()
  })

  it('does not read when nothing is an image', async () => {
    const { source, opened } = fake({})
    const loaded = await loadSceneImages([], source, 'd', 'png')
    expect(opened).toEqual([])
    expect(loaded).toMatchObject({ count: 0, placeholders: [] })
  })

  it('without a source, every image is a placeholder', async () => {
    const loaded = await loadSceneImages(
      [image('a', 'f1')],
      undefined,
      'd',
      'png',
    )
    expect(loaded.placeholders).toEqual([
      { elementId: 'a', fileId: 'f1', reason: 'not loaded' },
    ])
  })

  it('names each image it cannot show, and why', async () => {
    const valid = solidPng(4, 4)
    // A real header with the pixel data cut off: sized, but not decodable.
    const cut = valid.slice(0, 40)
    const loaded = await loadSceneImages(
      ['ok', 'gone', 'err', 'svg', 'big', 'junk', 'cut'].map((name) =>
        image(`e-${name}`, name),
      ),
      fake({
        ok: png(valid),
        err: { error: 'GET /api/images/err failed with 500' },
        svg: { bytes: valid, mimeType: 'image/svg+xml' },
        big: png(new Uint8Array(MAX_IMAGE_BYTES + 1)),
        junk: png(new TextEncoder().encode('not an image')),
        cut: png(cut),
      }).source,
      'd',
      'png',
    )
    expect(loaded.placeholders.map((p) => [p.elementId, p.reason])).toEqual([
      ['e-gone', 'missing'],
      ['e-err', 'read failed: GET /api/images/err failed with 500'],
      ['e-svg', 'unsupported type'],
      ['e-big', 'too large'],
      ['e-junk', 'undecodable'],
      ['e-cut', 'undecodable'],
    ])
    expect(loaded.lookup('ok')).toBeDefined()
  })

  it("turns a reader that throws into that one image's failure", async () => {
    const source: ImageSource = {
      open: async () => async (fileId) => {
        if (fileId === 'bad') throw new Error('disk gone')
        return png()
      },
    }
    const loaded = await loadSceneImages(
      [image('a', 'bad'), image('b', 'good')],
      source,
      'd',
      'png',
    )
    expect(loaded.placeholders).toEqual([
      { elementId: 'a', fileId: 'bad', reason: 'read failed: disk gone' },
    ])
    expect(loaded.lookup('good')).toBeDefined()
  })

  it('refuses an image over the pixel limit before decoding it', async () => {
    // A 4x4 PNG whose header claims 10,000 x 10,000: never decoded.
    const bytes = solidPng(4, 4)
    const view = new DataView(bytes.buffer)
    view.setUint32(16, 10_000)
    view.setUint32(20, 10_000)
    const loaded = await loadSceneImages(
      [image('a', 'f1')],
      fake({ f1: png(bytes) }).source,
      'd',
      'png',
    )
    expect(loaded.placeholders).toEqual([
      { elementId: 'a', fileId: 'f1', reason: 'too large to decode' },
    ])
  })

  it('stops decoding at the render total, in element order', async () => {
    const loaded = await loadSceneImages(
      [image('a', 'f1'), image('b', 'f2'), image('c', 'f3')],
      fake({
        f1: png(solidPng(10, 10)),
        f2: png(solidPng(10, 10, '#00ff00')),
        f3: png(solidPng(2, 2)),
      }).source,
      'd',
      'png',
      { ...IMAGE_LIMITS, renderPixels: 150 },
    )
    // 100 + 100 is past 150; the small third still fits.
    expect(loaded.placeholders).toEqual([
      { elementId: 'b', fileId: 'f2', reason: 'too large to decode' },
    ])
  })

  it('charges an SVG for every use of an image', async () => {
    const shared = solidPng(4, 4)
    const single = solidPng(5, 5)
    const loaded = await loadSceneImages(
      [image('a', 'f1'), image('b', 'f1'), image('c', 'f1'), image('d', 'f2')],
      fake({ f1: png(shared), f2: png(single) }).source,
      'd',
      'svg',
      // Just short of three copies of the shared image; the other one fits.
      { ...IMAGE_LIMITS, svgBytes: shared.byteLength * 3 - 1 },
    )
    expect(single.byteLength).toBeLessThan(shared.byteLength * 3)
    expect(loaded.placeholders.map((p) => [p.elementId, p.reason])).toEqual([
      ['a', 'over the SVG size limit'],
      ['b', 'over the SVG size limit'],
      ['c', 'over the SVG size limit'],
    ])
    expect(loaded.dataUri('f1')).toBeUndefined()
    expect(loaded.dataUri('f2')).toBeDefined()
  })

  it('has no SVG budget for a PNG', async () => {
    const loaded = await loadSceneImages(
      [image('a', 'f1'), image('b', 'f1')],
      fake({ f1: png() }).source,
      'd',
      'png',
      { ...IMAGE_LIMITS, svgBytes: 1 },
    )
    expect(loaded.placeholders).toEqual([])
  })
})
