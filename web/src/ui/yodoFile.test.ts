import { describe, expect, test, vi } from 'vitest'
import { createDocument, createImage } from '../core/document/create.ts'
import { parseYodoFile } from '../core/document/file.ts'
import { DocumentError } from '../core/document/migrate.ts'
import { InMemoryImageRepository } from '../storage/memoryImages.ts'
import {
  exportDrawing,
  exportErrorMessage,
  importErrorMessage,
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
