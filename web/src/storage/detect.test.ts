import { describe, expect, test, vi } from 'vitest'
import { detectRepository } from './detect.ts'
import { HttpDrawingRepository } from './http.ts'
import { HttpImageRepository } from './httpImages.ts'
import {
  IndexedDbDrawingRepository,
  IndexedDbImageRepository,
} from './indexeddb.ts'

const baseUrl = new URL('https://example.test/yodo/')

function replying(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => response())
}

describe('detectRepository', () => {
  test('picks HTTP when the Yodo server answers the health check', async () => {
    const fetch = replying(() => Response.json({ status: 'ok' }))
    const { mode, repository, images } = await detectRepository({
      baseUrl,
      fetch,
    })
    expect(mode).toBe('self-hosted')
    expect(repository).toBeInstanceOf(HttpDrawingRepository)
    expect(images).toBeInstanceOf(HttpImageRepository)
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
    const { mode, repository, images } = await detectRepository({
      baseUrl,
      fetch: replying(response),
    })
    expect(mode).toBe('hosted')
    expect(repository).toBeInstanceOf(IndexedDbDrawingRepository)
    expect(images).toBeInstanceOf(IndexedDbImageRepository)
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

  describe('the optional password', () => {
    function serverWithPassword(drawingsStatus: number) {
      return vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname
        if (path.endsWith('/api/health')) return Response.json({ status: 'ok' })
        if (path.endsWith('/api/session')) {
          return Response.json({ passwordRequired: true, unlocked: false })
        }
        return new Response('x', { status: drawingsStatus })
      })
    }

    test('a self-hosted server brings its session state', async () => {
      const { session } = await detectRepository({
        baseUrl,
        fetch: serverWithPassword(401),
      })
      expect(session?.getSnapshot()).toEqual({
        locked: true,
        appVisible: false,
      })
    })

    test('the hosted app has no session', async () => {
      const { session } = await detectRepository({
        baseUrl,
        fetch: replying(() => new Response('', { status: 404 })),
      })
      expect(session).toBeUndefined()
    })

    test('a 401 from the API locks the session and still reaches the caller', async () => {
      const { session, repository } = await detectRepository({
        baseUrl,
        fetch: vi.fn<typeof fetch>(async (input) => {
          const path = new URL(String(input)).pathname
          if (path.endsWith('/api/health'))
            return Response.json({ status: 'ok' })
          if (path.endsWith('/api/session')) {
            return Response.json({ passwordRequired: true, unlocked: true })
          }
          return new Response('unauthorized', { status: 401 })
        }),
      })
      expect(session?.getSnapshot().locked).toBe(false)

      await expect(repository.list()).rejects.toMatchObject({ status: 401 })

      expect(session?.getSnapshot()).toEqual({ locked: true, appVisible: true })
    })

    test('if the session probe fails the app still starts, unlocked', async () => {
      const { mode, session } = await detectRepository({
        baseUrl,
        fetch: vi.fn<typeof fetch>(async (input) =>
          new URL(String(input)).pathname.endsWith('/api/health')
            ? Response.json({ status: 'ok' })
            : new Response('x', { status: 503 }),
        ),
      })
      expect(mode).toBe('self-hosted')
      expect(session?.getSnapshot()).toEqual({
        locked: false,
        appVisible: true,
      })
    })

    test('unlock posts the password to api/session', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        const path = new URL(String(input)).pathname
        if (path.endsWith('/api/health')) return Response.json({ status: 'ok' })
        if (init?.method === 'POST') return new Response(null, { status: 204 })
        return Response.json({ passwordRequired: true, unlocked: false })
      })
      const { session } = await detectRepository({ baseUrl, fetch })

      await expect(session?.unlock('pw', true)).resolves.toBe('ok')

      expect(session?.getSnapshot()).toEqual({
        locked: false,
        appVisible: true,
      })
    })
  })
})
