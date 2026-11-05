import { describe, expect, test, vi } from 'vitest'
import { createLinear, createText } from '../core/document/create.ts'
import { createFontLoader, pageFontsReady, type Fetch } from './svgFonts.ts'

const urls = {
  hand: { latin: '/hand.woff2', 'latin-ext': '/hand-ext.woff2' },
  sans: { latin: '/sans.woff2', 'latin-ext': '/sans-ext.woff2' },
  mono: { latin: '/mono.woff2', 'latin-ext': '/mono-ext.woff2' },
}
const okFetch = (): Fetch =>
  vi.fn(async () => ({ ok: true, blob: async () => new Blob(['abc']) }))

describe('createFontLoader', () => {
  test('returns each file as base64 with its family and subset', async () => {
    const load = createFontLoader(okFetch(), urls)
    expect(await load([{ family: 'sans', subset: 'latin' }])).toEqual([
      { family: 'sans', subset: 'latin', base64: 'YWJj' },
    ])
  })

  test('fetches a file once, however often it is asked for', async () => {
    const fetchFile = okFetch()
    const load = createFontLoader(fetchFile, urls)
    await load([{ family: 'sans', subset: 'latin' }])
    await load([{ family: 'sans', subset: 'latin' }])
    expect(fetchFile).toHaveBeenCalledTimes(1)
  })

  test('rejects on a failed response and tries again next time', async () => {
    const fetchFile = vi
      .fn<Fetch>()
      .mockResolvedValueOnce({ ok: false, blob: async () => new Blob() })
      .mockResolvedValue({ ok: true, blob: async () => new Blob(['abc']) })
    const load = createFontLoader(fetchFile, urls)
    const file = [{ family: 'sans', subset: 'latin' }] as const
    await expect(load(file)).rejects.toThrow('Could not load the font')
    await expect(load(file)).resolves.toHaveLength(1)
  })
})

describe('pageFontsReady', () => {
  const text = {
    ...createText([0, 0], 1),
    text: 'Łódź',
    fontFamily: 'hand' as const,
  }

  test('waits for the fonts of the exported text before resolving', async () => {
    let release!: () => void
    const loading = new Promise<void>((resolve) => (release = resolve))
    const fonts = { load: vi.fn(() => loading), ready: Promise.resolve() }
    let done = false
    const ready = pageFontsReady([text], fonts).then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    expect(fonts.load).toHaveBeenCalledWith(
      expect.stringContaining('Caveat Variable'),
      'Łódź',
    )
    release()
    await ready
    expect(done).toBe(true)
  })

  test('does not wait for fonts when nothing has text', async () => {
    const fonts = { load: vi.fn(), ready: Promise.resolve() }
    await pageFontsReady(
      [createLinear('line', { x: 0, y: 0, width: 1, height: 1, points: [] })],
      fonts,
    )
    expect(fonts.load).not.toHaveBeenCalled()
  })

  test('carries on when a font fails to load', async () => {
    const fonts = {
      load: vi.fn().mockRejectedValue(new Error('x')),
      ready: Promise.resolve(),
    }
    await expect(pageFontsReady([text], fonts)).resolves.toBeUndefined()
  })
})
