// Installs the IndexedDB globals (IDBRequest, IDBKeyRange, …) that idb uses.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDocument, createText } from '../core/document/create.ts'
import { describeRepositoryContract } from './contract.ts'
import { describeFolderContract } from './folderContract.ts'
import { describeImageContract, pngBlob } from './imageContract.ts'
import { sha256Hex } from './images.ts'
import {
  DEFAULT_DB_NAME,
  IndexedDbDrawingRepository,
  IndexedDbFolderRepository,
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

describeFolderContract('IndexedDb repositories', () => ({
  drawings: new IndexedDbDrawingRepository(),
  folders: new IndexedDbFolderRepository(),
}))

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

test('upgrading a populated version-2 database keeps drawings and images and adds folders', async () => {
  // A database exactly as the released version 2 created it: drawings,
  // documents and one image blob.
  const doc = createDocument('From v2')
  const bytes = await pngBlob().arrayBuffer()
  const v2 = await openDB(DEFAULT_DB_NAME, 2, {
    upgrade(db) {
      db.createObjectStore('drawings', { keyPath: 'id' })
      db.createObjectStore('documents', { keyPath: 'id' })
      db.createObjectStore('blobs', { keyPath: 'hash' })
    },
  })
  const summary = { id: doc.id, name: doc.name, createdAt: 1, updatedAt: 2 }
  await v2.put('drawings', summary)
  await v2.put('documents', doc)
  const images = new IndexedDbImageRepository()
  const hash = await sha256Hex(bytes)
  await v2.put('blobs', { hash, type: 'image/png', bytes })
  v2.close()

  const drawings = new IndexedDbDrawingRepository()
  expect(await drawings.list()).toEqual([summary])
  expect(await drawings.get(doc.id)).toEqual(doc)
  expect(await images.has(hash)).toBe(true)
  expect(await (await images.get(hash))!.arrayBuffer()).toEqual(bytes)

  // Folders work on the upgraded database, and the old drawing can join one.
  const folders = new IndexedDbFolderRepository()
  expect(await folders.list()).toEqual([])
  const folder = await folders.save({
    id: 'f1',
    name: 'Work',
    icon: 'folder',
    color: 'graphite',
  })
  expect(await drawings.move(doc.id, folder.id)).toEqual({
    ...summary,
    folderId: folder.id,
  })
  await folders.delete(folder.id)
  expect(await drawings.list()).toEqual([])
  // Deleting the folder took the drawing, not the image.
  expect(await images.has(hash)).toBe(true)
})

test('upgrading a populated version-3 database indexes the existing drawings for search', async () => {
  // A database exactly as the released version 3 created it.
  const withText = {
    ...createDocument('Has text'),
    elements: [
      { ...createText([0, 0]), text: 'budget' },
      { ...createText([0, 0]), text: 'a\uD800b' },
    ],
  }
  const plain = createDocument('Plain')
  const v3 = await openDB(DEFAULT_DB_NAME, 3, {
    upgrade(db) {
      db.createObjectStore('drawings', { keyPath: 'id' })
      db.createObjectStore('documents', { keyPath: 'id' })
      db.createObjectStore('blobs', { keyPath: 'hash' })
      db.createObjectStore('folders', { keyPath: 'id' })
    },
  })
  for (const doc of [withText, plain]) {
    await v3.put('drawings', {
      id: doc.id,
      name: doc.name,
      createdAt: 1,
      updatedAt: 2,
    })
    await v3.put('documents', doc)
  }
  // A document the extractor can't read must not stop the database opening.
  const broken = { ...createDocument('Broken'), elements: [null] }
  await v3.put('drawings', {
    id: broken.id,
    name: 'Broken',
    createdAt: 1,
    updatedAt: 2,
  })
  await v3.put('documents', broken)
  v3.close()

  const drawings = new IndexedDbDrawingRepository()
  const index = new Map(
    (await drawings.searchIndex()).map((e) => [e.id, e.searchText]),
  )
  expect(index.get(withText.id)).toBe('budget\na\uFFFDb')
  expect(index.get(plain.id)).toBe('')
  expect(index.get(broken.id)).toBe('')
  expect(await drawings.get(withText.id)).toEqual(withText)
})
