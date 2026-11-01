import { describe, expect, test } from 'vitest'
// `?raw` imports the file as a string (Vite), so the test loads it exactly as
// a repository or file import would: from JSON text.
import v1Fixture from './fixtures/v1-every-element.json?raw'
import {
  DocumentError,
  type Migrations,
  loadDocument,
  migrate,
  runMigrations,
} from './migrate.ts'
import { CURRENT_SCHEMA_VERSION } from './types.ts'

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof DocumentError) return error.code
    throw error
  }
  return undefined
}

const validEnvelope = {
  type: 'yodo',
  schemaVersion: 1,
  id: 'doc-1',
  name: 'Doc',
  elements: [],
  appState: { viewport: { x: 0, y: 0, zoom: 1 } },
  fileIds: [],
}

describe('loadDocument', () => {
  test('loads the v1 fixture with every element type unchanged', () => {
    const doc = loadDocument(v1Fixture)

    expect(doc).toEqual(JSON.parse(v1Fixture))
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(doc.elements.map((element) => element.type)).toEqual([
      'rectangle',
      'diamond',
      'ellipse',
      'line',
      'arrow',
      'pencil',
      'text',
    ])
  })

  test('rejects text that is not JSON', () => {
    expect(errorCode(() => loadDocument('{ not json'))).toBe('invalid-json')
  })
})

describe('migrate', () => {
  test.each([
    ['null', null],
    ['an array', []],
    ['a string', 'yodo'],
    ['an Excalidraw file', { ...validEnvelope, type: 'excalidraw' }],
    ['a document without elements', { ...validEnvelope, elements: undefined }],
    ['a document with non-array elements', { ...validEnvelope, elements: {} }],
  ])('rejects %s as not-yodo', (_label, raw) => {
    expect(errorCode(() => migrate(raw))).toBe('not-yodo')
  })

  test.each([
    ['missing', undefined],
    ['a string', '1'],
    ['a fraction', 1.5],
    ['zero', 0],
  ])('rejects a schemaVersion that is %s', (_label, schemaVersion) => {
    expect(errorCode(() => migrate({ ...validEnvelope, schemaVersion }))).toBe(
      'bad-version',
    )
  })

  test('rejects a document from a newer app instead of dropping data', () => {
    const raw = { ...validEnvelope, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    expect(errorCode(() => migrate(raw))).toBe('newer-version')
  })

  test('returns a current-version document as is', () => {
    expect(migrate(validEnvelope)).toEqual(validEnvelope)
  })
})

describe('runMigrations', () => {
  // Fake steps: the real registry is empty until a v2 exists.
  const fakeMigrations: Migrations = {
    1: (doc) => ({ ...doc, schemaVersion: 2, steps: ['1to2'] }),
    2: (doc) => ({
      ...doc,
      schemaVersion: 3,
      steps: [...(doc.steps as string[]), '2to3'],
    }),
  }

  test('applies every step in order up to the target', () => {
    const result = runMigrations({ schemaVersion: 1 }, fakeMigrations, 3)
    expect(result).toEqual({ schemaVersion: 3, steps: ['1to2', '2to3'] })
  })

  test('starts from the document version, not from 1', () => {
    const result = runMigrations(
      { schemaVersion: 2, steps: [] },
      fakeMigrations,
      3,
    )
    expect(result).toEqual({ schemaVersion: 3, steps: ['2to3'] })
  })

  test('does nothing when the document is already at the target', () => {
    const doc = { schemaVersion: 3 }
    expect(runMigrations(doc, fakeMigrations, 3)).toBe(doc)
  })

  test('throws when a step is missing', () => {
    expect(
      errorCode(() => runMigrations({ schemaVersion: 1 }, fakeMigrations, 4)),
    ).toBe('bad-version')
  })
})
