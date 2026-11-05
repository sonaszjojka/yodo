import { describe, expect, test } from 'vitest'
// `?raw` imports the file as a string (Vite), so the test loads it exactly as
// a repository or file import would: from JSON text.
import v1Fixture from './fixtures/v1-every-element.json?raw'
import {
  DocumentError,
  type Migrations,
  type RawDocument,
  loadDocument,
  migrate,
  migrateWith,
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
      'note',
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
    ['a document without appState', { ...validEnvelope, appState: undefined }],
    [
      'a document with a broken viewport',
      { ...validEnvelope, appState: { viewport: { x: 0, y: 0 } } },
    ],
    ['a document without fileIds', { ...validEnvelope, fileIds: undefined }],
    ['a document with non-string fileIds', { ...validEnvelope, fileIds: [1] }],
    ['a document without an id', { ...validEnvelope, id: undefined }],
    ['a document with a non-string name', { ...validEnvelope, name: 7 }],
  ])('rejects %s as not-yodo', (_label, raw) => {
    expect(errorCode(() => migrate(raw))).toBe('not-yodo')
  })

  test.each([
    ['missing', undefined],
    ['a string', '1'],
    ['a fraction', 1.5],
    ['zero', 0],
    ['a symbol', Symbol('v')],
    ['an object', { major: 1 }],
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

describe('migrateWith', () => {
  // A fake v1 -> v2 step that edits nested data in place, as a careless real
  // step might.
  const v1 = () => ({ ...validEnvelope, elements: [{ n: 1 }] })
  const steps: Migrations = {
    1: (doc) => {
      ;(doc.elements as { n: number }[])[0]!.n = 2
      return { ...doc, schemaVersion: 2 }
    },
  }

  test("does not change the caller's input while migrating", () => {
    const raw = v1()
    expect(migrateWith(raw, steps, 2).elements).toEqual([{ n: 2 }])
    expect(raw.elements).toEqual([{ n: 1 }])
  })

  test('rejects a migrated document whose envelope is broken', () => {
    const dropsFileIds: Migrations = {
      1: (doc) => ({ ...doc, schemaVersion: 2, fileIds: undefined }),
    }
    expect(errorCode(() => migrateWith(v1(), dropsFileIds, 2))).toBe('not-yodo')
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

  test('reports a missing step as an app bug, not bad data', () => {
    expect(
      errorCode(() => runMigrations({ schemaVersion: 1 }, fakeMigrations, 4)),
    ).toBe('migration-error')
  })

  test.each([
    ['does not bump the version', (doc: RawDocument) => ({ ...doc })],
    [
      'skips a version',
      (doc: RawDocument) => ({ ...doc, schemaVersion: doc.schemaVersion + 2 }),
    ],
  ])('throws instead of looping when a step %s', (_label, step) => {
    expect(
      errorCode(() => runMigrations({ schemaVersion: 1 }, { 1: step }, 3)),
    ).toBe('migration-error')
  })
})
