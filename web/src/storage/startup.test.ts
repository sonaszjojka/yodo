import { expect, test, vi } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { InMemoryDrawingRepository } from './memory.ts'
import { openLastDrawing } from './startup.ts'

test('opens the drawing saved most recently', async () => {
  let time = 0
  const repository = new InMemoryDrawingRepository({ now: () => time })
  const older = createDocument('older')
  const newer = createDocument('newer')
  time = 1
  await repository.save(newer)
  time = 2
  await repository.save(older)
  time = 3
  await repository.save({ ...newer, name: 'newer, edited' })

  const doc = await openLastDrawing(repository)

  expect(doc.id).toBe(newer.id)
  expect(doc.name).toBe('newer, edited')
})

test('starts a new, unsaved drawing when there is none', async () => {
  const repository = new InMemoryDrawingRepository()

  const doc = await openLastDrawing(repository)

  expect(doc.elements).toEqual([])
  expect(await repository.list()).toEqual([])
})

test.each([
  ['list', { list: () => Promise.reject(new Error('500')) }],
  ['get', { get: () => Promise.reject(new Error('newer schemaVersion')) }],
] as const)(
  'starts a new drawing when %s fails, instead of failing startup',
  async (_method, failing) => {
    const repository = new InMemoryDrawingRepository()
    await repository.save(createDocument('stored'))
    Object.assign(repository, failing)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const doc = await openLastDrawing(repository)

    expect(doc.name).toBe('Untitled')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  },
)
