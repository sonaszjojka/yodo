import { describe, expect, test, vi } from 'vitest'
import { detectRepository } from './detect.ts'
import { HttpDrawingRepository } from './http.ts'
import { IndexedDbDrawingRepository } from './indexeddb.ts'

const baseUrl = new URL('https://example.test/yodo/')

function replying(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => response())
}

describe('detectRepository', () => {
  test('picks HTTP when the Yodo server answers the health check', async () => {
    const fetch = replying(() => Response.json({ status: 'ok' }))
    const { mode, repository } = await detectRepository({ baseUrl, fetch })
    expect(mode).toBe('self-hosted')
    expect(repository).toBeInstanceOf(HttpDrawingRepository)
  })

  test('probes api/health relative to the app base', async () => {
    const fetch = replying(() => Response.json({ status: 'ok' }))
    await detectRepository({ baseUrl, fetch })
    expect(String(fetch.mock.calls[0]![0])).toBe(
      'https://example.test/yodo/api/health',
    )
  })

  test.each([
    [
      'a 404 (GitHub Pages)',
      () => new Response('<h1>404</h1>', { status: 404 }),
    ],
    [
      'an HTML 200 (Vite dev server fallback)',
      () =>
        new Response('<!doctype html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
    ],
    ['other JSON', () => Response.json({ status: 'starting' })],
    ['JSON null', () => Response.json(null)],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('falls back to IndexedDB on %s', async (_, response) => {
    const { mode, repository } = await detectRepository({
      baseUrl,
      fetch: replying(response),
    })
    expect(mode).toBe('hosted')
    expect(repository).toBeInstanceOf(IndexedDbDrawingRepository)
  })

  test('falls back to IndexedDB when the probe times out', async () => {
    // Never answers, but rejects once the request is aborted, like real fetch.
    const hanging = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal!.reason),
          )
        }),
    )
    const { mode } = await detectRepository({
      baseUrl,
      fetch: hanging,
      timeoutMs: 10,
    })
    expect(mode).toBe('hosted')
  })
})
