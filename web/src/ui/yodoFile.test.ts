import { describe, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { parseYodoFile } from '../core/document/file.ts'
import { DocumentError } from '../core/document/migrate.ts'
import { exportDrawing, importErrorMessage } from './yodoFile.ts'

describe('exportDrawing', () => {
  test('downloads the drawing as a .yodo file named after it', () => {
    const download = vi.fn()
    const doc = { ...createDocument('My plan: v2') }

    exportDrawing(doc, download)

    expect(download).toHaveBeenCalledTimes(1)
    const [filename, text, mimeType] = download.mock.calls[0] as string[]
    expect(filename).toBe('My plan_ v2.yodo')
    expect(mimeType).toBe('application/json')
    expect(parseYodoFile(text!).document).toEqual(doc)
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
