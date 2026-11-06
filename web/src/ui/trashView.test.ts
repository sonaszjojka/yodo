import { expect, test } from 'vitest'
import type { DrawingSummary } from '../storage/repository.ts'
import {
  deleteForeverMessage,
  emptyTrashMessage,
  sortTrash,
  trashCountText,
  TRASH_RULE_TEXT,
} from './trashView.ts'

const d = (id: string, deletedAt: number): DrawingSummary => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  deletedAt,
})

test('sorts the newest deletion first and breaks ties by id', () => {
  const list = [d('b', 5), d('a', 5), d('c', 9), d('old', 1)]
  expect(sortTrash(list).map((s) => s.id)).toEqual(['c', 'a', 'b', 'old'])
  expect(list.map((s) => s.id)).toEqual(['b', 'a', 'c', 'old'])
})

test('describes the count', () => {
  expect(trashCountText(0)).toBe('Trash is empty')
  expect(trashCountText(1)).toBe('1 drawing in Trash')
  expect(trashCountText(3)).toBe('3 drawings in Trash')
})

test('states the retention rule and what the dialogs delete', () => {
  expect(TRASH_RULE_TEXT).toBe('Drawings are deleted forever after 30 days.')
  expect(emptyTrashMessage(1)).toBe(
    'Delete 1 drawing in Trash forever? This can’t be undone.',
  )
  expect(emptyTrashMessage(4)).toContain('4 drawings')
  expect(deleteForeverMessage('Plan')).toBe(
    'Delete “Plan” forever? This can’t be undone.',
  )
})
