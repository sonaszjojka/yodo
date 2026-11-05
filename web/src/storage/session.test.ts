import { describe, expect, test, vi } from 'vitest'
import {
  createSession,
  getSessionState,
  sendPassword,
  type UnlockResult,
} from './session.ts'

const baseUrl = new URL('https://example.test/yodo/')

describe('getSessionState', () => {
  test('reads the state relative to the app base', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ passwordRequired: true, unlocked: false }),
    )
    await expect(getSessionState(baseUrl, fetch, 1000)).resolves.toEqual({
      passwordRequired: true,
      unlocked: false,
    })
    expect(String(fetch.mock.calls[0]![0])).toBe(
      'https://example.test/yodo/api/session',
    )
  })

  test.each([
    ['a non-200 answer', () => new Response('x', { status: 500 })],
    ['an unexpected body', () => Response.json({ status: 'ok' })],
  ])('throws on %s', async (_name, reply) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => reply())
    await expect(getSessionState(baseUrl, fetch, 1000)).rejects.toThrow()
  })

  test('gives up when the server does not answer in time', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )
    await expect(getSessionState(baseUrl, fetch, 10)).rejects.toBeDefined()
  })
})

describe('sendPassword', () => {
  test.each<[number, UnlockResult]>([
    [204, 'ok'],
    [401, 'wrong'],
    [429, 'throttled'],
  ])('maps a %i answer to %s', async (status, expected) => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status }),
    )
    await expect(sendPassword(baseUrl, fetch, 'pw', false)).resolves.toBe(
      expected,
    )
  })

  test('posts the password and the remember choice as JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 204 }),
    )
    await sendPassword(baseUrl, fetch, 'pw', true)
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://example.test/yodo/api/session')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      password: 'pw',
      remember: true,
    })
  })

  test('throws on a status the API does not promise', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('x', { status: 500 }),
    )
    await expect(sendPassword(baseUrl, fetch, 'pw', false)).rejects.toThrow()
  })
})

describe('createSession', () => {
  const send = (result: UnlockResult) => vi.fn(async () => result)

  test.each([
    [{ passwordRequired: false, unlocked: true }, false, true],
    [{ passwordRequired: true, unlocked: true }, false, true],
    [{ passwordRequired: true, unlocked: false }, true, false],
  ])('starts as %j', (state, locked, appVisible) => {
    expect(createSession(state, send('ok')).getSnapshot()).toEqual({
      locked,
      appVisible,
    })
  })

  test('a right password unlocks, shows the app and tells the listeners', async () => {
    const session = createSession(
      { passwordRequired: true, unlocked: false },
      send('ok'),
    )
    const changed = vi.fn()
    const unlocked = vi.fn()
    session.subscribe(changed)
    session.onUnlocked(unlocked)

    await expect(session.unlock('pw', false)).resolves.toBe('ok')

    expect(session.getSnapshot()).toEqual({ locked: false, appVisible: true })
    expect(changed).toHaveBeenCalledTimes(1)
    expect(unlocked).toHaveBeenCalledTimes(1)
  })

  test.each<UnlockResult>(['wrong', 'throttled'])(
    'a %s answer keeps it locked',
    async (result) => {
      const session = createSession(
        { passwordRequired: true, unlocked: false },
        send(result),
      )
      const unlocked = vi.fn()
      session.onUnlocked(unlocked)

      await expect(session.unlock('pw', false)).resolves.toBe(result)

      expect(session.getSnapshot()).toEqual({ locked: true, appVisible: false })
      expect(unlocked).not.toHaveBeenCalled()
    },
  )

  test('locking later keeps the app visible, and is announced once', () => {
    const session = createSession(
      { passwordRequired: true, unlocked: true },
      send('ok'),
    )
    const changed = vi.fn()
    session.subscribe(changed)

    session.lock()
    session.lock()

    expect(session.getSnapshot()).toEqual({ locked: true, appVisible: true })
    expect(changed).toHaveBeenCalledTimes(1)
  })

  test('the snapshot is the same object until something changes', () => {
    const session = createSession(
      { passwordRequired: true, unlocked: true },
      send('ok'),
    )
    expect(session.getSnapshot()).toBe(session.getSnapshot())
  })
})
