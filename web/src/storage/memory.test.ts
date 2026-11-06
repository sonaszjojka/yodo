import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { describeRepositoryContract } from './contract.ts'
import { describeFolderContract } from './folderContract.ts'
import {
  InMemoryDrawingRepository,
  InMemoryFolderRepository,
  MemoryData,
} from './memory.ts'

describeRepositoryContract(
  'InMemoryDrawingRepository',
  () => new InMemoryDrawingRepository(),
)

describeFolderContract('InMemory repositories', () => {
  const data = new MemoryData()
  return {
    drawings: new InMemoryDrawingRepository({ data }),
    folders: new InMemoryFolderRepository({ data }),
  }
})

test('stamps createdAt on the first save and updatedAt on every save', async () => {
  let time = 1000
  const repo = new InMemoryDrawingRepository({ now: () => time })
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
