// HttpDrawingRepository against the real Go server (ADR 0011, 0031). Runs with
// `npm run test:server`, whose global setup builds and starts the server.

import { expect, inject, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { describeRepositoryContract } from './contract.ts'
import { describeFolderContract } from './folderContract.ts'
import { HttpDrawingRepository } from './http.ts'
import { HttpFolderRepository } from './httpFolders.ts'
import { HttpImageRepository } from './httpImages.ts'
import { describeImageContract } from './imageContract.ts'

// `inject('serverUrl')` is typed by web/test/provided-context.d.ts.
const baseUrl = new URL(inject('serverUrl'))

// Browsers send Origin on PUT and DELETE themselves; Node's fetch doesn't, and
// the server refuses those methods without it (ADR 0020).
const fetchWithOrigin: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('Origin', baseUrl.origin)
  return fetch(input, { ...init, headers })
}

function repository(): HttpDrawingRepository {
  return new HttpDrawingRepository({ baseUrl, fetch: fetchWithOrigin })
}

// One server serves every test, so each starts by emptying it.
async function emptyRepository(): Promise<HttpDrawingRepository> {
  const repo = repository()
  for (const { id } of await repo.list()) await repo.delete(id)
  return repo
}

describeRepositoryContract('HttpDrawingRepository', emptyRepository)

// Deleting every folder also deletes the drawings in them (ADR 0045).
describeFolderContract('Http repositories', async () => {
  const folders = new HttpFolderRepository({ baseUrl, fetch: fetchWithOrigin })
  for (const { id } of await folders.list()) await folders.delete(id)
  return { drawings: await emptyRepository(), folders }
})

test('a new repository instance sees earlier saves', async () => {
  const doc = createDocument('Persisted')
  const summary = await (await emptyRepository()).save(doc)

  const reopened = repository()
  expect(await reopened.get(doc.id)).toEqual(doc)
  expect(await reopened.list()).toEqual([summary])
})

describeImageContract(
  'HttpImageRepository',
  () => new HttpImageRepository({ baseUrl, fetch: fetchWithOrigin }),
)
