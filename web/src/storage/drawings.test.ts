import { describe, expect, test, vi } from 'vitest'
import {
  createDocument,
  createImage,
  createShape,
} from '../core/document/create.ts'
import { DocumentError } from '../core/document/migrate.ts'
import { blobToBase64 } from './base64.ts'
import {
  createDrawing,
  exportYodo,
  importDrawing,
  loadDrawing,
  renameDrawing,
  sortDrawings,
  yodoFileName,
} from './drawings.ts'
import { pngBlob } from './imageContract.ts'
import { InMemoryDrawingRepository } from './memory.ts'
import { InMemoryImageRepository } from './memoryImages.ts'
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

describe('exporting and importing a .yodo file', () => {
  async function drawingWithImage(images: InMemoryImageRepository) {
    const fileId = await images.put(pngBlob())
    const doc = createDocument('Plan')
    return {
      fileId,
      doc: {
        ...doc,
        elements: [
          createShape('rectangle', { x: 1, y: 2, width: 3, height: 4 }),
          createImage(
            fileId,
            { width: 1, height: 1 },
            { x: 0, y: 0, width: 100, height: 100 },
          ),
        ],
        appState: { viewport: { x: 5, y: 6, zoom: 2 } },
      },
    }
  }

  test('export inlines the images, even when fileIds is stale', async () => {
    const images = new InMemoryImageRepository()
    const { doc, fileId } = await drawingWithImage(images)

    const text = await exportYodo(doc, images)

    const file = JSON.parse(text) as {
      fileIds: string[]
      files: Record<string, { mimeType: string; data: string }>
    }
    expect(file.fileIds).toEqual([fileId])
    expect(file.files[fileId]?.mimeType).toBe('image/png')
    expect(file.files[fileId]?.data).toBe(await blobToBase64(pngBlob()))
  })

  test('export fails, naming the problem, when an image is gone', async () => {
    const { doc } = await drawingWithImage(new InMemoryImageRepository())

    await expect(
      exportYodo(doc, new InMemoryImageRepository()),
    ).rejects.toMatchObject({ code: 'bad-files' })
  })

  test('import recreates the drawing under a new id, images included', async () => {
    const source = new InMemoryImageRepository()
    const { doc, fileId } = await drawingWithImage(source)
    const text = await exportYodo(doc, source)
    const repository = new InMemoryDrawingRepository()
    const images = new InMemoryImageRepository()

    const id = await importDrawing(repository, images, text)

    expect(id).not.toBe(doc.id)
    expect(await repository.get(id)).toEqual({
      ...doc,
      id,
      fileIds: [fileId],
    })
    expect(await images.has(fileId)).toBe(true)
  })

  test('importing the same file twice makes two drawings', async () => {
    const repository = new InMemoryDrawingRepository()
    const images = new InMemoryImageRepository()
    const text = await exportYodo(createDocument('Plan'), images)

    const first = await importDrawing(repository, images, text)
    const second = await importDrawing(repository, images, text)

    expect(first).not.toBe(second)
    expect(await repository.list()).toHaveLength(2)
  })

  test('a broken file saves nothing', async () => {
    const repository = new InMemoryDrawingRepository()
    const images = new InMemoryImageRepository()

    await expect(
      importDrawing(repository, images, '{ nope'),
    ).rejects.toMatchObject({ code: 'invalid-json' })
    expect(await repository.list()).toEqual([])
  })

  test('an image whose bytes do not match its hash saves nothing', async () => {
    const source = new InMemoryImageRepository()
    const { doc, fileId } = await drawingWithImage(source)
    const file = JSON.parse(await exportYodo(doc, source)) as {
      files: Record<string, { mimeType: string; data: string }>
    }
    file.files[fileId]!.data = await blobToBase64(new Blob(['other bytes']))
    const repository = new InMemoryDrawingRepository()
    const images = new InMemoryImageRepository()

    const failure = await importDrawing(
      repository,
      images,
      JSON.stringify(file),
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DocumentError)
    expect(failure).toMatchObject({ code: 'bad-files' })
    expect(await repository.list()).toEqual([])
    expect(await images.has(fileId)).toBe(false)
  })

  test('an image type the app does not accept saves nothing', async () => {
    const source = new InMemoryImageRepository()
    const { doc, fileId } = await drawingWithImage(source)
    const file = JSON.parse(await exportYodo(doc, source)) as {
      files: Record<string, { mimeType: string; data: string }>
    }
    file.files[fileId]!.mimeType = 'image/svg+xml'
    const repository = new InMemoryDrawingRepository()

    await expect(
      importDrawing(
        repository,
        new InMemoryImageRepository(),
        JSON.stringify(file),
      ),
    ).rejects.toMatchObject({ code: 'bad-files' })
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
