import { describe, expect, test, vi } from 'vitest'
import { detectRepository } from './detect.ts'
import { HttpDrawingRepository } from './http.ts'
import { HttpFolderRepository } from './httpFolders.ts'
import { HttpImageRepository } from './httpImages.ts'
import {
  IndexedDbDrawingRepository,
  IndexedDbFolderRepository,
  IndexedDbImageRepository,
} from './indexeddb.ts'

const baseUrl = new URL('https://example.test/yodo/')

function replying(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => response())
}

describe('detectRepository', () => {
  test('picks HTTP when the Yodo server answers the health check', async () => {
    const fetch = replying(() => Response.json({ status: 'ok' }))
    const { mode, repository, folders, images } = await detectRepository({
      baseUrl,
      fetch,
    })
    expect(mode).toBe('self-hosted')
    expect(repository).toBeInstanceOf(HttpDrawingRepository)
    expect(folders).toBeInstanceOf(HttpFolderRepository)
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
    const { mode, repository, folders, images } = await detectRepository({
      baseUrl,
      fetch: replying(response),
    })
    expect(mode).toBe('hosted')
    expect(repository).toBeInstanceOf(IndexedDbDrawingRepository)
    expect(folders).toBeInstanceOf(IndexedDbFolderRepository)
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

    /** A server whose drawings answer 401 until `unlocked` is set. */
    function expiring() {
      const state = { unlocked: false, drawingCalls: 0 }
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        const path = new URL(String(input)).pathname
        if (path.endsWith('/api/health')) return Response.json({ status: 'ok' })
        if (path.endsWith('/api/session')) {
          if (init?.method === 'POST') {
            state.unlocked = true
            return new Response(null, { status: 204 })
          }
          return Response.json({ passwordRequired: true, unlocked: true })
        }
        state.drawingCalls++
        return state.unlocked
          ? Response.json([])
          : new Response('unauthorized', { status: 401 })
      })
      return { state, fetch }
    }
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

    test('a 401 locks the session and holds the request until the unlock, then retries it', async () => {
      const { state, fetch } = expiring()
      const { session, repository } = await detectRepository({ baseUrl, fetch })
      expect(session?.getSnapshot().locked).toBe(false)

      let settled = false
      const listing = repository.list().then((drawings) => {
        settled = true
        return drawings
      })
      await tick()

      expect(session?.getSnapshot()).toEqual({ locked: true, appVisible: true })
      expect(settled).toBe(false)

      await session?.unlock('pw', false)

      // The write that met the expired session is not lost.
      await expect(listing).resolves.toEqual([])
      expect(state.drawingCalls).toBe(2)
      expect(session?.getSnapshot().locked).toBe(false)
    })

    test('a request that is still refused after the unlock fails with its 401', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        const path = new URL(String(input)).pathname
        if (path.endsWith('/api/health')) return Response.json({ status: 'ok' })
        if (path.endsWith('/api/session')) {
          return init?.method === 'POST'
            ? new Response(null, { status: 204 })
            : Response.json({ passwordRequired: true, unlocked: true })
        }
        return new Response('unauthorized', { status: 401 })
      })
      const { session, repository } = await detectRepository({ baseUrl, fetch })
      const listing = repository.list()
      const failed = expect(listing).rejects.toMatchObject({ status: 401 })
      await tick()

      await session?.unlock('pw', false)

      await failed
      expect(session?.getSnapshot().locked).toBe(true)
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
