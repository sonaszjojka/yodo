import { describe, expect, test, vi } from 'vitest'
import { ExcalidrawImportError } from '../core/excalidraw/convert.ts'
import images from '../core/excalidraw/fixtures/images.excalidraw?raw'
import shapes from '../core/excalidraw/fixtures/shapes.excalidraw?raw'
import { estimateMeasure } from '../core/text/layout.ts'
import { MAX_OPEN_LINK_BYTES } from '../core/document/openLink.ts'
import { importExcalidrawFile, MAX_IMPORT_BYTES } from './importExcalidraw.ts'
import { InMemoryDrawingRepository } from './memory.ts'
import { InMemoryImageRepository } from './memoryImages.ts'

function setup() {
  const drawings = new InMemoryDrawingRepository()
  const store = new InMemoryImageRepository()
  return {
    drawings,
    store,
    deps: {
      drawings,
      images: store,
      measure: estimateMeasure,
      decode: async () => ({ width: 1, height: 1 }),
    },
  }
}

describe('importExcalidrawFile', () => {
  test('saves the drawing and returns its id and summary', async () => {
    const { drawings, deps } = setup()
    const { id, summary } = await importExcalidrawFile(shapes, deps)
    expect((await drawings.get(id))?.elements).toHaveLength(7)
    expect(summary.imported).toBe(7)
  })

  test('stores images under their real hash, once, and drops unusable ones', async () => {
    const { drawings, store, deps } = setup()
    const put = vi.spyOn(store, 'put')
    const { id, summary } = await importExcalidrawFile(images, deps)
    const doc = await drawings.get(id)
    const [fileId] = doc!.fileIds
    expect(fileId).toMatch(/^[0-9a-f]{64}$/)
    expect(doc!.fileIds).toHaveLength(1)
    expect(await store.has(fileId!)).toBe(true)
    expect(doc!.elements.filter((e) => e.type === 'image')).toHaveLength(2)
    expect(put).toHaveBeenCalledTimes(1)
    expect(summary.skipped.map((e) => e.reason)).toEqual([
      'images that could not be read',
      'images missing from the file',
    ])
  })

  test('saves nothing for a file that is not Excalidraw', async () => {
    const { drawings, deps } = setup()
    await expect(importExcalidrawFile('{', deps)).rejects.toBeInstanceOf(
      ExcalidrawImportError,
    )
    await expect(
      importExcalidrawFile('{"type":"yodo"}', deps),
    ).rejects.toBeInstanceOf(ExcalidrawImportError)
    expect(await drawings.list()).toEqual([])
  })

  test('aborts without saving when the image store fails', async () => {
    const { drawings, store, deps } = setup()
    vi.spyOn(store, 'put').mockRejectedValue(new Error('HTTP 500'))
    const save = vi.spyOn(drawings, 'save')
    await expect(importExcalidrawFile(images, deps)).rejects.toThrow('HTTP 500')
    expect(save).not.toHaveBeenCalled()
  })

  test('saves the drawing after its images are stored', async () => {
    const { drawings, store, deps } = setup()
    const order: string[] = []
    const put = store.put.bind(store)
    vi.spyOn(store, 'put').mockImplementation(async (blob) => {
      order.push('image')
      return put(blob)
    })
    const save = drawings.save.bind(drawings)
    vi.spyOn(drawings, 'save').mockImplementation(async (doc) => {
      order.push('drawing')
      return save(doc)
    })
    await importExcalidrawFile(images, deps)
    expect(order).toEqual(['image', 'drawing'])
  })
})

test('open links inflate up to the same limit as a file import (ADR 0069)', () => {
  expect(MAX_OPEN_LINK_BYTES).toBe(MAX_IMPORT_BYTES)
})
