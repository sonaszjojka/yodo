// The real wiring from index.ts, without Go: HttpDrawingRepository with the
// bearer fetch, against a stub that plays the server's part.

import { describe, expect, it } from 'vitest'
import { HttpDrawingRepository } from '../../web/src/storage/http.ts'
import { withBearer } from './auth.ts'
import { readConfig } from './config.ts'

type Fetch = typeof globalThis.fetch

function recorder(): { fetch: Fetch; calls: Request[] } {
  const calls: Request[] = []
  const fetch: Fetch = async (input, init) => {
    calls.push(new Request(input, init))
    return Response.json([])
  }
  return { fetch, calls }
}

describe('withBearer', () => {
  it('adds the token and keeps the other headers', async () => {
    const { fetch, calls } = recorder()
    await withBearer(fetch, 'secret')('http://h/x', {
      method: 'PUT',
      headers: { 'If-Match': '"3"' },
    })
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer secret')
    expect(calls[0].headers.get('If-Match')).toBe('"3"')
  })

  it('sends no Authorization header without a token', async () => {
    const { fetch, calls } = recorder()
    expect(withBearer(fetch, undefined)).toBe(fetch)
    await withBearer(fetch, undefined)('http://h/x')
    expect(calls[0].headers.has('Authorization')).toBe(false)
  })
})

describe('the HTTP repository as index.ts builds it', () => {
  it('calls the API under a sub-path with the bearer token', async () => {
    const { fetch, calls } = recorder()
    const config = readConfig({
      YODO_URL: 'https://yodo.example.com/yodo',
      YODO_API_TOKEN: 't0k3n',
    })
    if (config.backend !== 'http') throw new Error('expected HTTP')
    const { baseUrl, token } = config
    const repo = new HttpDrawingRepository({
      baseUrl,
      fetch: withBearer(fetch, token),
    })
    await repo.list()
    expect(calls[0].url).toBe('https://yodo.example.com/yodo/api/drawings')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer t0k3n')
  })
})
