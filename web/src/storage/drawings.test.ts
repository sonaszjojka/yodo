import { describe, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { serializeYodoFile } from '../core/document/file.ts'
import { createShape } from '../core/document/create.ts'
import { DocumentError } from '../core/document/migrate.ts'
import {
  createDrawing,
  importDrawing,
  loadDrawing,
  renameDrawing,
  sortDrawings,
  yodoFileName,
} from './drawings.ts'
import { InMemoryDrawingRepository } from './memory.ts'
import type { DrawingSummary } from './repository.ts'

describe('loadDrawing', () => {
  test('loads a stored drawing', async () => {
    const repository = new InMemoryDrawingRepository()
    const doc = createDocument('stored')
    await repository.save(doc)

    expect(await loadDrawing(repository, doc.id)).toEqual({
      status: 'loaded',
      document: doc,
    })
  })

  test('reports a missing drawing as not found, saving nothing', async () => {
    const repository = new InMemoryDrawingRepository()

    expect(await loadDrawing(repository, 'missing')).toEqual({
      status: 'not-found',
    })
    expect(await repository.list()).toEqual([])
  })

  test('reports a failing load as an error instead of a new drawing', async () => {
    const repository = new InMemoryDrawingRepository()
    const failure = new Error('newer schemaVersion')
    repository.get = () => Promise.reject(failure)

    expect(await loadDrawing(repository, 'any')).toEqual({
      status: 'error',
      error: failure,
    })
    expect(await repository.list()).toEqual([])
  })
})

test('loadDrawing waits for an earlier save before reading', async () => {
  const repository = new InMemoryDrawingRepository()
  const doc = createDocument('stored')
  await repository.save(doc)
  const get = vi.spyOn(repository, 'get')
  let finishSave!: () => void
  const saving = new Promise<void>((resolve) => (finishSave = resolve))

  const loading = loadDrawing(repository, doc.id, { after: saving })
  await Promise.resolve()
  expect(get).not.toHaveBeenCalled()

  finishSave()
  expect(await loading).toMatchObject({ status: 'loaded' })
  expect(get).toHaveBeenCalledOnce()
})

describe('createDrawing', () => {
  test('saves an empty drawing first, so it can be opened by id', async () => {
    const repository = new InMemoryDrawingRepository()

    const id = await createDrawing(repository)

    const doc = await repository.get(id)
    expect(doc?.elements).toEqual([])
    expect((await repository.list()).map((s) => s.id)).toEqual([id])
  })
})

describe('renameDrawing', () => {
  test('changes the name, trimmed, and keeps createdAt and elements', async () => {
    let time = 1
    const repository = new InMemoryDrawingRepository({ now: () => time })
    const doc = createDocument('old')
    const before = await repository.save(doc)
    time = 2

    const summary = await renameDrawing(repository, doc.id, '  New name ')

    expect(summary).toMatchObject({
      id: doc.id,
      name: 'New name',
      createdAt: before.createdAt,
    })
    expect(await repository.get(doc.id)).toEqual({ ...doc, name: 'New name' })
  })

  test('ignores an empty name', async () => {
    const repository = new InMemoryDrawingRepository()
    const doc = createDocument('kept')
    await repository.save(doc)

    expect(await renameDrawing(repository, doc.id, '   ')).toBeUndefined()
    expect((await repository.get(doc.id))?.name).toBe('kept')
  })

  test('returns undefined for a missing drawing and creates nothing', async () => {
    const repository = new InMemoryDrawingRepository()

    expect(await renameDrawing(repository, 'missing', 'x')).toBeUndefined()
    expect(await repository.list()).toEqual([])
  })
})

describe('sortDrawings', () => {
  const summary = (
    id: string,
    name: string,
    createdAt: number,
    updatedAt: number,
  ): DrawingSummary => ({ id, name, createdAt, updatedAt })
  const list = [
    summary('a', 'beta', 1, 5),
    summary('b', 'Alpha', 3, 4),
    summary('c', 'gamma', 2, 6),
  ]
  const ids = (s: DrawingSummary[]) => s.map(({ id }) => id)

  test('recent: last edited first', () => {
    expect(ids(sortDrawings(list, 'recent'))).toEqual(['c', 'a', 'b'])
  })

  test('created: newest first', () => {
    expect(ids(sortDrawings(list, 'created'))).toEqual(['b', 'c', 'a'])
  })

  test('name: A to Z, ignoring case', () => {
    expect(ids(sortDrawings(list, 'name'))).toEqual(['b', 'a', 'c'])
  })

  test('ties keep a stable order by id, and the input is not changed', () => {
    const tied = [summary('y', 'same', 1, 1), summary('x', 'Same', 1, 1)]

    for (const by of ['recent', 'created', 'name'] as const) {
      expect(ids(sortDrawings(tied, by))).toEqual(['x', 'y'])
    }
    expect(ids(tied)).toEqual(['y', 'x'])
  })
})

describe('importDrawing', () => {
  function exported() {
    const doc = createDocument('Plan')
    return {
      doc: {
        ...doc,
        elements: [
          createShape('rectangle', { x: 1, y: 2, width: 3, height: 4 }),
        ],
        appState: { viewport: { x: 5, y: 6, zoom: 2 } },
      },
    }
  }

  test('saves the drawing under a new id with the same content', async () => {
    const repository = new InMemoryDrawingRepository()
    const { doc } = exported()

    const id = await importDrawing(repository, serializeYodoFile(doc, {}))

    expect(id).not.toBe(doc.id)
    expect(await repository.get(id)).toEqual({ ...doc, id })
  })

  test('importing the same file twice makes two drawings', async () => {
    const repository = new InMemoryDrawingRepository()
    const text = serializeYodoFile(exported().doc, {})

    const first = await importDrawing(repository, text)
    const second = await importDrawing(repository, text)

    expect(first).not.toBe(second)
    expect(await repository.list()).toHaveLength(2)
  })

  test('a broken file saves nothing', async () => {
    const repository = new InMemoryDrawingRepository()

    await expect(importDrawing(repository, '{ nope')).rejects.toMatchObject({
      code: 'invalid-json',
    })
    expect(await repository.list()).toEqual([])
  })

  test('refuses images until the app can store them, saving nothing', async () => {
    const repository = new InMemoryDrawingRepository()
    const doc = { ...exported().doc, fileIds: ['hash-a'] }
    const text = serializeYodoFile(doc, {
      'hash-a': { mimeType: 'image/png', data: 'AAAA' },
    })

    const failure = await importDrawing(repository, text).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(DocumentError)
    expect(failure).toMatchObject({ code: 'images-unsupported' })
    expect(await repository.list()).toEqual([])
  })
})

describe('yodoFileName', () => {
  test.each([
    ['Plan', 'Plan.yodo'],
    ['  Plan  ', 'Plan.yodo'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j.yodo'],
    ['', 'Untitled.yodo'],
    ['   ', 'Untitled.yodo'],
    ['line\nbreak', 'line_break.yodo'],
    ['Plan.', 'Plan.yodo'],
  ])('%j becomes %j', (name, expected) => {
    expect(yodoFileName(name)).toBe(expected)
  })
})
