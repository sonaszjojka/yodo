// Installs the IndexedDB globals (IDBRequest, IDBKeyRange, …) that idb uses.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { describeRepositoryContract } from './contract.ts'
import { IndexedDbDrawingRepository } from './indexeddb.ts'

// A fresh, empty in-memory IndexedDB for every test (ADR 0011).
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describeRepositoryContract(
  'IndexedDbDrawingRepository',
  () => new IndexedDbDrawingRepository(),
)

test('keeps drawings when the database is opened again', async () => {
  const doc = createDocument('Persisted')
  const summary = await new IndexedDbDrawingRepository().save(doc)

  const reopened = new IndexedDbDrawingRepository()
  expect(await reopened.get(doc.id)).toEqual(doc)
  expect(await reopened.list()).toEqual([summary])
})

test('stamps createdAt on the first save and updatedAt on every save', async () => {
  let time = 1000
  const repo = new IndexedDbDrawingRepository({ now: () => time })
  const doc = createDocument('Clock')

  expect(await repo.save(doc)).toMatchObject({
    createdAt: 1000,
    updatedAt: 1000,
  })
  time = 2500
  expect(await repo.save(doc)).toMatchObject({
    createdAt: 1000,
    updatedAt: 2500,
  })
})

test('uses separate databases for separate names', async () => {
  const doc = createDocument('Only in one')
  await new IndexedDbDrawingRepository({ dbName: 'yodo-a' }).save(doc)
  expect(
    await new IndexedDbDrawingRepository({ dbName: 'yodo-b' }).list(),
  ).toEqual([])
})
