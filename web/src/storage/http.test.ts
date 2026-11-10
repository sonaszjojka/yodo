import { describe, expect, test, vi } from 'vitest'
import { createDocument, createText } from '../core/document/create.ts'
import v1Fixture from '../core/document/fixtures/v1-every-element.json?raw'
import { migrate } from '../core/document/migrate.ts'
import {
  HttpDrawingRepository,
  HttpError,
  MAX_HEADER_TEXT,
  SEARCH_TEXT_HEADER,
  toStrictJson,
} from './http.ts'
import { HttpFolderRepository } from './httpFolders.ts'
import { RevisionConflictError } from './repository.ts'

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

function docWithText(...texts: string[]) {
  return {
    ...createDocument('Notes'),
    elements: texts.map((text) => ({ ...createText([0, 0]), text })),
  }
}

describe('HttpDrawingRepository revisions (ADR 0062)', () => {
  const summary = {
    id: 'a',
    name: 'A',
    createdAt: 1,
    updatedAt: 2,
    revision: 4,
  }

  test('save sends If-Match only with an expected revision', async () => {
    const { fetch, repo } = repoReplying(() => Response.json(summary))
    const doc = createDocument()
    await repo.save(doc)
    await repo.save(doc, { expectedRevision: 3 })
    const headers = fetch.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('If-Match'),
    )
    expect(headers).toEqual([null, '"3"'])
  })

  test('a 412 rejects with the revision from the ETag', async () => {
    const { repo } = repoReplying(
      () => new Response('newer', { status: 412, headers: { ETag: '"7"' } }),
    )
    const error = await repo
      .save(createDocument(), { expectedRevision: 3 })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RevisionConflictError)
    expect((error as RevisionConflictError).currentRevision).toBe(7)
  })

  test('a 412 without an ETag means the drawing is gone', async () => {
    const { repo } = repoReplying(() => new Response('', { status: 412 }))
    const error = await repo
      .save(createDocument(), { expectedRevision: 3 })
      .catch((e: unknown) => e)
    expect((error as RevisionConflictError).currentRevision).toBeUndefined()
  })

  test('getWithRevision reads the ETag of the GET', async () => {
    const doc = createDocument()
    const { repo } = repoReplying(
      () => new Response(JSON.stringify(doc), { headers: { ETag: '"5"' } }),
    )
    expect(await repo.getWithRevision(doc.id)).toEqual({ doc, revision: 5 })
  })

  test('getWithRevision fails on a missing or odd ETag rather than guessing', async () => {
    const doc = createDocument()
    for (const headers of [[], [['ETag', 'W/"5"']], [['ETag', '"x"']]] as [
      string,
      string,
    ][][]) {
      const { repo } = repoReplying(
        () => new Response(JSON.stringify(doc), { headers }),
      )
      await expect(repo.getWithRevision(doc.id)).rejects.toThrow(/ETag/)
    }
  })

  test('getRevision uses HEAD, and a 404 is undefined', async () => {
    const { fetch, repo } = repoReplying(
      () => new Response(null, { headers: { ETag: '"9"' } }),
    )
    expect(await repo.getRevision('a')).toBe(9)
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/drawings/a',
      method: 'HEAD',
    })
    const missing = repoReplying(() => new Response(null, { status: 404 }))
    expect(await missing.repo.getRevision('a')).toBeUndefined()
    expect(await missing.repo.getWithRevision('a')).toBeUndefined()
  })
})

describe('HttpDrawingRepository search (ADR 0047)', () => {
  test('save sends the canvas text percent-encoded in a header', async () => {
    const doc = docWithText('zażółć 😀', 'line 2')
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await repo.save(doc)

    expect(fetch).toHaveBeenCalledTimes(1)
    const sent = new Headers(request(fetch).init?.headers).get(
      SEARCH_TEXT_HEADER,
    )
    expect(decodeURIComponent(sent!)).toBe('zażółć 😀\nline 2')
    // Header values are Latin-1 only; the encoding keeps them ASCII.
    expect(sent).toMatch(/^[\x20-\x7e]*$/)
  })

  test('save sends an empty header for a drawing without text', async () => {
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await repo.save(createDocument())
    const headers = new Headers(request(fetch).init?.headers)
    expect(headers.get(SEARCH_TEXT_HEADER)).toBe('')
  })

  test('save cleans a lone surrogate instead of failing', async () => {
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await repo.save(docWithText('a\uD800b'))
    const headers = new Headers(request(fetch).init?.headers)
    expect(decodeURIComponent(headers.get(SEARCH_TEXT_HEADER)!)).toBe(
      'a\uFFFDb',
    )
  })

  test('text too long for a header follows in a second request, whole', async () => {
    const long = 'x'.repeat(MAX_HEADER_TEXT + 1)
    const doc = docWithText(long)
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await repo.save(doc)

    expect(fetch).toHaveBeenCalledTimes(2)
    const [first, second] = fetch.mock.calls
    expect(new Headers(first![1]?.headers).has(SEARCH_TEXT_HEADER)).toBe(false)
    expect(String(second![0])).toBe(
      `https://example.test/yodo/api/drawings/${doc.id}/search-text`,
    )
    expect(second![1]).toMatchObject({ method: 'PUT', body: long })
  })

  test('text far beyond the header limit is sent whole, never cut', async () => {
    const huge = `${'x'.repeat(300_000)}uniqueTail`
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await repo.save(docWithText(huge))
    expect(fetch.mock.calls[1]![1]?.body).toBe(huge)
  })

  test('a failed second request does not fail the save', async () => {
    const doc = docWithText('x'.repeat(MAX_HEADER_TEXT + 1))
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ++calls === 1
        ? Response.json({ id: doc.id })
        : new Response('no', { status: 500 }),
    )
    const repo = new HttpDrawingRepository({ baseUrl, fetch })
    await expect(repo.save(doc)).resolves.toMatchObject({ id: doc.id })
  })

  test('searchIndex reads GET api/search-index', async () => {
    const rows = [{ id: 'a', searchText: 'budget' }]
    const { fetch, repo } = repoReplying(() => Response.json(rows))
    expect(await repo.searchIndex()).toEqual(rows)
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/search-index',
      method: 'GET',
    })
  })

  test('searchIndex indexes drawings the server has no text for, only if still unset', async () => {
    const doc = docWithText('budget')
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('api/search-index'))
        return Response.json([
          { id: doc.id, searchText: null },
          { id: 'done', searchText: 'x' },
        ])
      if (init?.method === 'PUT') return new Response(null, { status: 204 })
      return Response.json(doc)
    })
    const repo = new HttpDrawingRepository({ baseUrl, fetch })

    expect(await repo.searchIndex()).toEqual([
      { id: doc.id, searchText: 'budget' },
      { id: 'done', searchText: 'x' },
    ])
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(String(put[0])).toBe(
      `https://example.test/yodo/api/drawings/${doc.id}/search-text?ifUnset=true`,
    )
    expect(put[1]?.body).toBe('budget')
  })

  test('searchIndex fails when a document needed for the backfill cannot be read', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith('api/search-index')
        ? Response.json([{ id: 'a', searchText: null }])
        : new Response('boom', { status: 500 }),
    )
    const repo = new HttpDrawingRepository({ baseUrl, fetch })
    await expect(repo.searchIndex()).rejects.toThrow(HttpError)
  })

  test('searchIndex skips a drawing deleted during the backfill', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith('api/search-index')
        ? Response.json([{ id: 'a', searchText: null }])
        : new Response('gone', { status: 404 }),
    )
    const repo = new HttpDrawingRepository({ baseUrl, fetch })
    expect(await repo.searchIndex()).toEqual([{ id: 'a', searchText: '' }])
  })

  test('searchIndex still answers when a backfill request fails', async () => {
    const doc = docWithText('budget')
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith('api/search-index'))
        return Response.json([{ id: doc.id, searchText: null }])
      if (init?.method === 'PUT') return new Response('no', { status: 500 })
      return Response.json(doc)
    })
    const repo = new HttpDrawingRepository({ baseUrl, fetch })
    expect(await repo.searchIndex()).toEqual([
      { id: doc.id, searchText: 'budget' },
    ])
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

describe('HttpDrawingRepository.move', () => {
  test('puts the folder id to api/drawings/{id}/folder', async () => {
    const summary = {
      id: 'a b',
      name: 'A',
      createdAt: 1,
      updatedAt: 2,
      folderId: 'f',
    }
    const { fetch, repo } = repoReplying(() => Response.json(summary))
    expect(await repo.move('a b', 'f')).toEqual(summary)
    const { url, method, init } = request(fetch)
    expect(url).toBe('https://example.test/yodo/api/drawings/a%20b/folder')
    expect(method).toBe('PUT')
    expect(JSON.parse(init!.body as string)).toEqual({ folderId: 'f' })
  })

  test('sends null to take a drawing out of its folder', async () => {
    const { fetch, repo } = repoReplying(() =>
      Response.json({ id: 'a', name: 'A', createdAt: 1, updatedAt: 2 }),
    )
    await repo.move('a', null)
    expect(JSON.parse(request(fetch).init!.body as string)).toEqual({
      folderId: null,
    })
  })

  test('a 404 is a missing drawing, a 400 is an error', async () => {
    const missing = repoReplying(() => new Response('', { status: 404 }))
    expect(await missing.repo.move('a', null)).toBeUndefined()
    const noFolder = repoReplying(
      () => new Response('folder not found', { status: 400 }),
    )
    await expect(noFolder.repo.move('a', 'x')).rejects.toMatchObject({
      status: 400,
    })
  })

  test.each(['.', '..'])('refuses the id %j without a request', async (id) => {
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await expect(repo.move(id, null)).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('HttpFolderRepository', () => {
  const input = { id: 'f/1', name: 'Work', icon: 'folder', color: 'teal' }

  function foldersReplying(response: () => Response) {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response())
    return { fetch, repo: new HttpFolderRepository({ baseUrl, fetch }) }
  }

  test('lists from GET api/folders', async () => {
    const folders = [{ ...input, createdAt: 1 }]
    const { fetch, repo } = foldersReplying(() => Response.json(folders))
    expect(await repo.list()).toEqual(folders)
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/folders',
      method: 'GET',
    })
  })

  test('saves with PUT of exactly the folder fields', async () => {
    const { fetch, repo } = foldersReplying(() =>
      Response.json({ ...input, createdAt: 1 }),
    )
    expect(await repo.save(input)).toEqual({ ...input, createdAt: 1 })
    const { url, method, init } = request(fetch)
    expect(url).toBe('https://example.test/yodo/api/folders/f%2F1')
    expect(method).toBe('PUT')
    expect(JSON.parse(init!.body as string)).toEqual(input)
  })

  test('deletes with DELETE and expects 204', async () => {
    const { fetch, repo } = foldersReplying(
      () => new Response(null, { status: 204 }),
    )
    await repo.delete('f')
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/folders/f',
      method: 'DELETE',
    })
  })

  test('a failing status throws HttpError', async () => {
    const { repo } = foldersReplying(
      () => new Response('nope', { status: 400 }),
    )
    await expect(repo.save(input)).rejects.toBeInstanceOf(HttpError)
  })

  test.each(['.', '..'])('refuses the id %j without a request', async (id) => {
    const { fetch, repo } = foldersReplying(() => Response.json({}))
    await expect(repo.delete(id)).rejects.toThrow(TypeError)
    await expect(repo.save({ ...input, id })).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('HttpDrawingRepository Trash (ADR 0046)', () => {
  const trashed = {
    id: 'a b',
    name: 'A',
    createdAt: 1,
    updatedAt: 2,
    deletedAt: 3,
  }

  test('lists the trash from GET api/drawings?trashed=true', async () => {
    const { fetch, repo } = repoReplying(() => Response.json([trashed]))
    expect(await repo.listTrash()).toEqual([trashed])
    expect(request(fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/drawings?trashed=true',
      method: 'GET',
    })
  })

  test('trash and restore put {trashed} to api/drawings/{id}/trash', async () => {
    for (const [method, trashedFlag] of [
      ['trash', true],
      ['restore', false],
    ] as const) {
      const { fetch, repo } = repoReplying(() => Response.json(trashed))
      expect(await repo[method]('a b')).toEqual(trashed)
      const { url, init } = request(fetch)
      expect(url).toBe('https://example.test/yodo/api/drawings/a%20b/trash')
      expect(init?.method).toBe('PUT')
      expect(JSON.parse(init!.body as string)).toEqual({
        trashed: trashedFlag,
      })
    }
  })

  test('trash and restore resolve undefined for a 404 and throw for other errors', async () => {
    const missing = repoReplying(
      () => new Response('drawing not found', { status: 404 }),
    )
    expect(await missing.repo.trash('a')).toBeUndefined()
    expect(await missing.repo.restore('a')).toBeUndefined()
    const broken = repoReplying(() => new Response('x', { status: 400 }))
    await expect(broken.repo.trash('a')).rejects.toBeInstanceOf(HttpError)
  })

  test('emptyTrash deletes api/drawings?trashed=true, with the cutoff when given', async () => {
    const all = repoReplying(() => new Response(null, { status: 204 }))
    await all.repo.emptyTrash()
    expect(request(all.fetch)).toMatchObject({
      url: 'https://example.test/yodo/api/drawings?trashed=true',
      method: 'DELETE',
    })
    const cut = repoReplying(() => new Response(null, { status: 204 }))
    await cut.repo.emptyTrash({ deletedBefore: 1234.9 })
    expect(request(cut.fetch).url).toBe(
      'https://example.test/yodo/api/drawings?trashed=true&deletedBefore=1234',
    )
  })

  test('refuses "." and ".." ids without a request', async () => {
    const { fetch, repo } = repoReplying(() => Response.json({}))
    await expect(repo.trash('..')).rejects.toThrow(TypeError)
    await expect(repo.restore('.')).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
