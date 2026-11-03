import { describe, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import v1Fixture from '../core/document/fixtures/v1-every-element.json?raw'
import { migrate } from '../core/document/migrate.ts'
import { HttpDrawingRepository, HttpError, toStrictJson } from './http.ts'

// The behaviour shared with other repositories is proven against the real
// server by `http.server-test.ts`; these tests cover the HTTP mapping alone.

const baseUrl = new URL('https://example.test/yodo/')

function repoReplying(response: () => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response())
  return { fetch, repo: new HttpDrawingRepository({ baseUrl, fetch }) }
}

function request(fetch: ReturnType<typeof repoReplying>['fetch']) {
  const [url, init] = fetch.mock.calls[0]!
  return { url: String(url), method: init?.method ?? 'GET', init }
}

describe('HttpDrawingRepository', () => {
  test('lists from GET api/drawings', async () => {
    const summaries = [{ id: 'a', name: 'A', createdAt: 1, updatedAt: 2 }]
    const { fetch, repo } = repoReplying(() => Response.json(summaries))
    expect(await repo.list()).toEqual(summaries)
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/drawings',
      method: 'GET',
    })
  })

  test('encodes the id in the path', async () => {
    const { fetch, repo } = repoReplying(
      () => new Response(null, { status: 204 }),
    )
    await repo.delete('a/b?c')
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/drawings/a%2Fb%3Fc',
      method: 'DELETE',
    })
  })

  // URL parsing collapses "." and ".." segments (even as %2e), so the request
  // would reach another route.
  test.each(['.', '..'])('refuses the id %j without a request', async (id) => {
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await expect(repo.get(id)).rejects.toThrow(TypeError)
    await expect(repo.delete(id)).rejects.toThrow(TypeError)
    await expect(repo.save({ ...createDocument(), id })).rejects.toThrow(
      TypeError,
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('get returns undefined for a 404', async () => {
    const { repo } = repoReplying(
      () => new Response('drawing not found', { status: 404 }),
    )
    expect(await repo.get('missing')).toBeUndefined()
  })

  test('get migrates the stored document', async () => {
    const { repo } = repoReplying(() => new Response(v1Fixture))
    const doc = await repo.get('any')
    expect(doc).toEqual(migrate(JSON.parse(v1Fixture)))
  })

  test('save PUTs the document as JSON and returns the summary', async () => {
    const doc = createDocument('Plan')
    const summary = { id: doc.id, name: 'Plan', createdAt: 5, updatedAt: 5 }
    const { fetch, repo } = repoReplying(() => Response.json(summary))
    expect(await repo.save(doc)).toEqual(summary)

    const { url, method, init } = request(fetch)
    expect(url).toBe(`https://example.test/yodo/api/drawings/${doc.id}`)
    expect(method).toBe('PUT')
    expect(new Headers(init?.headers).get('Content-Type')).toBe(
      'application/json',
    )
    expect(JSON.parse(init?.body as string)).toEqual(doc)
  })

  test.each([
    ['list', (r: HttpDrawingRepository) => r.list()],
    ['get', (r: HttpDrawingRepository) => r.get('x')],
    ['save', (r: HttpDrawingRepository) => r.save(createDocument())],
    ['delete', (r: HttpDrawingRepository) => r.delete('x')],
  ])('%s throws HttpError on an unexpected status', async (_, call) => {
    const { repo } = repoReplying(
      () => new Response('forbidden: origin', { status: 403 }),
    )
    const error = await call(repo).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 403 })
    expect((error as Error).message).toContain('forbidden: origin')
  })

  test('save sends nothing for a document JSON cannot represent', async () => {
    const { fetch, repo } = repoReplying(() => Response.json({}))
    const bad = { ...createDocument(), elements: [() => {}] }
    await expect(repo.save(bad as never)).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('toStrictJson', () => {
  test('matches JSON.stringify for plain data', () => {
    const value = { a: [1, 'two', null, { b: true }] }
    expect(toStrictJson(value)).toBe(JSON.stringify(value))
  })

  test.each([
    ['a function', { f: () => {} }],
    ['a function in an array', [() => {}]],
    ['a symbol', { s: Symbol('x') }],
    ['NaN', { x: Number.NaN }],
    ['Infinity', { x: Number.POSITIVE_INFINITY }],
    ['-Infinity in an array', [Number.NEGATIVE_INFINITY]],
    ['undefined in an array', [1, undefined]],
  ])('throws on %s instead of changing it', (_, value) => {
    expect(() => toStrictJson(value)).toThrow(TypeError)
  })
})
