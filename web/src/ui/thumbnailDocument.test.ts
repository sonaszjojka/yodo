import { expect, test } from 'vitest'
import { createDocument } from '../core/document/create.ts'
import { InMemoryDrawingRepository } from '../storage/memory.ts'
import { thumbnailDocument } from './thumbnailDocument.ts'

test('resolves only once the fonts are ready, so text draws in its font', async () => {
  const repository = new InMemoryDrawingRepository()
  const doc = createDocument('with text')
  await repository.save(doc)
  let fontsLoaded!: () => void
  const fonts = new Promise<void>((resolve) => (fontsLoaded = resolve))
  let result: unknown = 'pending'

  void thumbnailDocument(repository, doc.id, fonts).then((d) => (result = d))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(result).toBe('pending')

  fontsLoaded()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(result).toEqual(doc)
})
