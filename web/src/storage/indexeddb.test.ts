// Installs the IndexedDB globals (IDBRequest, IDBKeyRange, …) that idb uses.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { describeRepositoryContract } from './contract.ts'
import { describeImageContract, pngBlob } from './imageContract.ts'
import {
  DEFAULT_DB_NAME,
  IndexedDbDrawingRepository,
  IndexedDbImageRepository,
} from './indexeddb.ts'

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

describeImageContract(
  'IndexedDbImageRepository',
  () => new IndexedDbImageRepository(),
)

test('upgrading a version-1 database keeps its drawings and adds image storage', async () => {
  // A database exactly as the released version 1 created it, with one drawing.
  const doc = createDocument('From v1')
  const v1 = await openDB(DEFAULT_DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('drawings', { keyPath: 'id' })
      db.createObjectStore('documents', { keyPath: 'id' })
    },
  })
  const summary = { id: doc.id, name: doc.name, createdAt: 1, updatedAt: 2 }
  await v1.put('drawings', summary)
  await v1.put('documents', doc)
  v1.close()

  const drawings = new IndexedDbDrawingRepository()
  expect(await drawings.list()).toEqual([summary])
  expect(await drawings.get(doc.id)).toEqual(doc)

  const images = new IndexedDbImageRepository()
  const hash = await images.put(pngBlob())
  expect(await images.has(hash)).toBe(true)
  // The drawing still reads after the image store was used.
  expect(await drawings.get(doc.id)).toEqual(doc)
})
