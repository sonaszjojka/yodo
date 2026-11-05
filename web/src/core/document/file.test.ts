import { describe, expect, test } from 'vitest'
import v1Fixture from './fixtures/v1-every-element.json?raw'
import v1Export from './fixtures/v1-export.yodo?raw'
import { parseYodoFile, serializeYodoFile, type YodoFileEntry } from './file.ts'
import { createImage } from './create.ts'
import { DocumentError, type Migrations } from './migrate.ts'
import type { YodoDocument } from './types.ts'

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof DocumentError) return error.code
    throw error
  }
  return undefined
}

const png: YodoFileEntry = { mimeType: 'image/png', data: 'iVBORw0KGgo=' }
const everyElement = JSON.parse(v1Fixture) as YodoDocument

/** The export fixture as an object, for tests that break one part of it. */
function exportObject(): Record<string, unknown> {
  return JSON.parse(v1Export) as Record<string, unknown>
}

describe('serializeYodoFile', () => {
  test('round-trips a document with every element type and an image', () => {
    const doc = { ...everyElement, fileIds: ['hash-a'] }

    const parsed = parseYodoFile(serializeYodoFile(doc, { 'hash-a': png }))

    expect(parsed.document).toEqual(doc)
    expect(parsed.files).toEqual({ 'hash-a': png })
  })

  test('writes only the images the document references', () => {
    const text = serializeYodoFile(everyElement, { stray: png })

    expect(JSON.parse(text)).toEqual({ ...everyElement, files: {} })
  })

  test('refuses a referenced image it has no data for', () => {
    const doc = { ...everyElement, fileIds: ['hash-a'] }

    expect(errorCode(() => serializeYodoFile(doc, {}))).toBe('bad-files')
  })
})

describe('parseYodoFile', () => {
  test('imports the v1 export fixture: the document plus its images', () => {
    const { document, files } = parseYodoFile(v1Export)

    expect(document).toEqual({
      ...everyElement,
      fileIds: ['hash-a'],
    })
    expect(files).toEqual({ 'hash-a': png })
  })

  test('migrates an older file and keeps its images', () => {
    // The file says version 1; the app "is" at version 2. A real 1 -> 2 step
    // must run on the document, never on the files.
    const seen: string[][] = []
    const steps: Migrations = {
      1: (doc) => {
        seen.push(Object.keys(doc))
        return { ...doc, schemaVersion: 2, migrated: true }
      },
    }

    const { document, files } = parseYodoFile(v1Export, steps, 2)

    expect(document).toMatchObject({ schemaVersion: 2, migrated: true })
    expect(document.elements).toEqual(everyElement.elements)
    expect(files).toEqual({ 'hash-a': png })
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toContain('files')
  })

  test('rejects an image element whose picture the document does not list', () => {
    const fileId = 'a'.repeat(64)
    const image = createImage(
      fileId,
      { width: 10, height: 10 },
      { x: 0, y: 0, width: 100, height: 100 },
    )
    const doc = { ...everyElement, elements: [image], fileIds: [] }

    expect(errorCode(() => parseYodoFile(JSON.stringify(doc)))).toBe(
      'bad-files',
    )
  })

  test('a file without a files section has no images', () => {
    const { files, document } = parseYodoFile(v1Fixture)

    expect(files).toEqual({})
    expect(document).toEqual(everyElement)
  })

  test('drops image entries the document does not reference', () => {
    expect(parseYodoFile(v1Export).files).not.toHaveProperty('unused')
  })

  test('never lets the files section into the document', () => {
    expect(parseYodoFile(v1Export).document).not.toHaveProperty('files')
  })

  test.each([
    ['text that is not JSON', '{ nope', 'invalid-json'],
    ['JSON that is not a Yodo document', '{"type":"other"}', 'not-yodo'],
    [
      'a newer schema version',
      JSON.stringify({ ...exportObject(), schemaVersion: 99 }),
      'newer-version',
    ],
    [
      'an image the document references but the file lacks',
      JSON.stringify({ ...exportObject(), files: {} }),
      'bad-files',
    ],
    [
      'a files section that is not an object',
      JSON.stringify({ ...exportObject(), files: [] }),
      'bad-files',
    ],
    [
      'image data that is not base64',
      JSON.stringify({
        ...exportObject(),
        files: { 'hash-a': { mimeType: 'image/png', data: 'not base64!' } },
      }),
      'bad-files',
    ],
    [
      'an entry that is not an image',
      JSON.stringify({
        ...exportObject(),
        files: { 'hash-a': { mimeType: 'text/html', data: 'AAAA' } },
      }),
      'bad-files',
    ],
    [
      'a null element',
      JSON.stringify({ ...exportObject(), elements: [null] }),
      'bad-elements',
    ],
    [
      'an element of an unknown type',
      JSON.stringify({
        ...exportObject(),
        elements: [{ ...everyElement.elements[0], type: 'hexagon' }],
      }),
      'bad-elements',
    ],
    [
      'two elements with the same id',
      JSON.stringify({
        ...exportObject(),
        elements: [everyElement.elements[0], everyElement.elements[0]],
      }),
      'bad-elements',
    ],
    [
      'elements that are not a list',
      JSON.stringify({ ...exportObject(), elements: {} }),
      'not-yodo',
    ],
  ])('rejects %s', (_name, text, code) => {
    expect(errorCode(() => parseYodoFile(text))).toBe(code)
  })

  test('reads a multi-megabyte image', () => {
    // 6 MB of base64 (about 4.5 MB of image): a regex that repeats a group
    // overflows the stack on input this size.
    const big = { mimeType: 'image/png', data: 'AAAA'.repeat(1_500_000) }
    const doc = { ...everyElement, fileIds: ['big'] }

    const text = serializeYodoFile(doc, { big })

    expect(parseYodoFile(text).files).toEqual({ big })
  })

  test('accepts more elements than a clipboard paste may carry', () => {
    const template = everyElement.elements[0]!
    const elements = Array.from({ length: 10_001 }, (_, i) => ({
      ...template,
      id: `el-${i}`,
    }))

    const { document } = parseYodoFile(
      JSON.stringify({ ...everyElement, elements }),
    )

    expect(document.elements).toHaveLength(10_001)
  })
})
