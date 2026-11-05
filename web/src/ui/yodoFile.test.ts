import { describe, expect, test, vi } from 'vitest'
import { exportYodo } from '../storage/drawings.ts'
import { InMemoryDrawingRepository } from '../storage/memory.ts'
import type { ImageCache } from './imageCache.ts'
import { createDocument, createImage } from '../core/document/create.ts'
import { parseYodoFile } from '../core/document/file.ts'
import { DocumentError } from '../core/document/migrate.ts'
import { InMemoryImageRepository } from '../storage/memoryImages.ts'
import {
  exportDrawing,
  exportErrorMessage,
  importErrorMessage,
  importFile,
} from './yodoFile.ts'

describe('exportDrawing', () => {
  test('downloads the drawing as a .yodo file named after it', async () => {
    const download = vi.fn()
    const doc = { ...createDocument('My plan: v2') }

    await exportDrawing(doc, new InMemoryImageRepository(), download)

    expect(download).toHaveBeenCalledTimes(1)
    const [filename, text, mimeType] = download.mock.calls[0] as string[]
    expect(filename).toBe('My plan_ v2.yodo')
    expect(mimeType).toBe('application/json')
    expect(parseYodoFile(text!).document).toEqual(doc)
  })

  test('downloads nothing when an image is gone', async () => {
    const download = vi.fn()
    const doc = {
      ...createDocument(),
      elements: [
        createImage(
          'a'.repeat(64),
          { width: 1, height: 1 },
          { x: 0, y: 0, width: 10, height: 10 },
        ),
      ],
    }

    await expect(
      exportDrawing(doc, new InMemoryImageRepository(), download),
    ).rejects.toBeInstanceOf(DocumentError)
    expect(download).not.toHaveBeenCalled()
  })
})

describe('exportErrorMessage', () => {
  test('names a missing image', () => {
    const error = new DocumentError('bad-files', 'x')
    expect(exportErrorMessage(error)).toMatch(/image/)
  })

  test('has a generic message for anything else', () => {
    expect(exportErrorMessage(new Error('x'))).toMatch(/Try again/)
  })
})

describe('importErrorMessage', () => {
  test('explains a newer file', () => {
    const error = new DocumentError('newer-version', 'x')
    expect(importErrorMessage(error)).toMatch(/newer version/)
  })

  test('explains a file that is not Yodo', () => {
    const error = new DocumentError('invalid-json', 'x')
    expect(importErrorMessage(error)).toBe('That file isn’t a Yodo file.')
  })

  test('has a generic message for anything else', () => {
    expect(importErrorMessage(new Error('disk full'))).toMatch(/Try again/)
  })
})

describe('importFile', () => {
  test('makes the shared image cache look again for the imported images', async () => {
    const source = new InMemoryImageRepository()
    const fileId = await source.put(
      new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/png' }),
    )
    const doc = {
      ...createDocument('Plan'),
      elements: [
        createImage(
          fileId,
          { width: 1, height: 1 },
          { x: 0, y: 0, width: 10, height: 10 },
        ),
      ],
    }
    const text = await exportYodo(doc, source)
    const refresh = vi.fn()
    const cache = { refresh } as unknown as ImageCache
    const repository = new InMemoryDrawingRepository()

    const id = await importFile(
      repository,
      new InMemoryImageRepository(),
      cache,
      text,
      { decode: async () => ({ width: 1, height: 1 }) },
    )

    expect(await repository.get(id)).toBeDefined()
    expect(refresh).toHaveBeenCalledExactlyOnceWith(fileId)
  })
})
