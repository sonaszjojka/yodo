import { expect, test } from 'vitest'
import { createDocument } from './create.ts'
import { loadDocument } from './migrate.ts'
import { CURRENT_SCHEMA_VERSION } from './types.ts'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('creates an empty document at the current schema version', () => {
  const doc = createDocument()

  expect(doc).toEqual({
    type: 'yodo',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: expect.stringMatching(UUID),
    name: 'Untitled',
    elements: [],
    appState: { viewport: { x: 0, y: 0, zoom: 1 } },
    fileIds: [],
  })
})

test('uses the given name and a new id each time', () => {
  const a = createDocument('Plan')
  const b = createDocument('Plan')

  expect(a.name).toBe('Plan')
  expect(a.id).not.toBe(b.id)
})

test('survives a save and load round trip', () => {
  const doc = createDocument('Round trip')
  expect(loadDocument(JSON.stringify(doc))).toEqual(doc)
})
