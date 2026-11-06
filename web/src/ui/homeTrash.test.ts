import { expect, test } from 'vitest'
import type { DrawingSummary } from '../storage/repository.ts'
import { withoutDrawing } from './homeTrash.ts'

const d = (id: string, deletedAt?: number): DrawingSummary => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  ...(deletedAt !== undefined && { deletedAt }),
})

test('drops a deleted drawing from both lists', () => {
  const lists = { drawings: [d('a'), d('b')], trashed: [d('c', 1)] }
  expect(withoutDrawing(lists, 'c')).toEqual({
    drawings: [d('a'), d('b')],
    trashed: [],
  })
})

// Codex review round 1, finding 1: Restore finished while the Delete forever
// confirmation was open, so the drawing is in `drawings` when it is deleted.
test('also drops it when an overlapping restore already moved it to the cards', () => {
  const lists = { drawings: [d('a'), d('r')], trashed: [] as DrawingSummary[] }
  expect(withoutDrawing(lists, 'r').drawings.map((s) => s.id)).toEqual(['a'])
})
