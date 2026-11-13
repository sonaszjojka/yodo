// The real wiring from index.ts, without Go: HttpDrawingRepository with the
// bearer fetch, against a stub that plays the server's part.

import { describe, expect, it } from 'vitest'
import { createDocument } from '../../web/src/core/document/create.ts'
import { HttpDrawingRepository } from '../../web/src/storage/http.ts'
import { HttpImageRepository } from '../../web/src/storage/httpImages.ts'
import { withBearer } from './auth.ts'
import { readConfig } from './config.ts'
import { HTTP_IMAGE_CONCURRENCY, httpImageSource } from './render/images.ts'
import { addElements } from './write/apply.ts'
import { writeDrawing } from './write/save.ts'

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

describe('a write over HTTP (ADR 0062, 0066)', () => {
  const doc = { ...createDocument('Flow'), id: 'd1' }
  const box = { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 } as const

  /** Serves `doc` at revision 3 and answers the PUT with `put`. */
  function server(put: () => Response) {
    const calls: Request[] = []
    const fetch: Fetch = async (input, init) => {
      const request = new Request(input, init)
      calls.push(request)
      if (request.method === 'GET') {
        return Response.json(doc, { headers: { ETag: '"3"' } })
      }
      return put()
    }
    const repo = new HttpDrawingRepository({
      baseUrl: new URL('http://h/'),
      fetch,
    })
    return { repo, calls }
  }

  const add = (repo: HttpDrawingRepository) =>
    writeDrawing(repo, 'd1', undefined, (d) =>
      addElements(d, [{ ...box, id: 'b' }], () => 0),
    )

  it('saves with If-Match set to the revision it read', async () => {
    const { repo, calls } = server(() =>
      Response.json({
        id: 'd1',
        name: 'Flow',
        createdAt: 1,
        updatedAt: 2,
        revision: 4,
      }),
    )
    expect(await add(repo)).toEqual({
      drawingId: 'd1',
      revision: 4,
      ids: ['b'],
    })
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.url).toBe('http://h/api/drawings/d1')
    expect(put.headers.get('If-Match')).toBe('"3"')
  })

  it('turns a 412 into the re-read and retry error', async () => {
    const { repo } = server(
      () => new Response(null, { status: 412, headers: { ETag: '"5"' } }),
    )
    expect(await add(repo)).toEqual({
      error:
        'Drawing "d1" changed since revision 3 (it is now at revision 5). ' +
        'Call get_drawing again and retry with the new revision.',
    })
  })
})

describe('the HTTP image source as index.ts builds it (ADR 0070)', () => {
  const hash = (digit: string) => digit.repeat(64)

  it('reads each image with the bearer, one failure per image only', async () => {
    const calls: Request[] = []
    let inFlight = 0
    let most = 0
    const fetch: Fetch = async (input, init) => {
      const request = new Request(input, init)
      calls.push(request)
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      const name = new URL(request.url).pathname.split('/').at(-1)!
      if (name === hash('0')) return new Response(null, { status: 404 })
      if (name === hash('1')) return new Response('boom', { status: 500 })
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      })
    }
    const source = httpImageSource(
      new HttpImageRepository({
        baseUrl: new URL('http://h/yodo/'),
        fetch: withBearer(fetch, 'secret'),
      }),
    )
    const ids = [hash('0'), hash('1'), ...'23456789'.split('').map(hash)]

    const reads = await source.read('drawing', ids)

    expect(calls).toHaveLength(ids.length)
    for (const call of calls) {
      expect(call.headers.get('Authorization')).toBe('Bearer secret')
      expect(new URL(call.url).pathname).toMatch(/^\/yodo\/api\/images\//)
    }
    expect(most).toBe(HTTP_IMAGE_CONCURRENCY)
    expect(reads.get(hash('0'))).toBeUndefined()
    expect(reads.get(hash('1'))).toEqual({
      error: expect.stringContaining('500'),
    })
    expect(reads.get(hash('2'))).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    })
  })
})
